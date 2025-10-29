/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { WebviewView, WebviewViewProvider, commands } from 'vscode'
import { StackChange } from '../stacks/actions/stackActionRequestType'
import { DiffViewHelper } from './diffViewHelper'
import { commandKey } from '../utils'

const webviewCommandOpenDiff = 'openDiff'

export class DiffWebviewProvider implements WebviewViewProvider {
    private _view?: WebviewView
    private stackName = ''
    private changes: StackChange[] = []
    private changeSetName?: string
    private enableDeployments: boolean = false

    updateData(stackName: string, changes: StackChange[] = [], changeSetName?: string, enableDeployments = false) {
        this.stackName = stackName
        this.changes = changes
        this.changeSetName = changeSetName
        this.enableDeployments = enableDeployments
        if (this._view) {
            this._view.webview.html = this.getHtmlContent()
        }
    }

    resolveWebviewView(webviewView: WebviewView) {
        this._view = webviewView
        webviewView.webview.options = { enableScripts: true }
        webviewView.webview.html = this.getHtmlContent()

        webviewView.webview.onDidReceiveMessage((message: { command: string; resourceId?: string }) => {
            if (message.command === webviewCommandOpenDiff) {
                void DiffViewHelper.openDiff(this.stackName, this.changes, message.resourceId)
            } else if (message.command === 'confirmDeploy') {
                if (this.changeSetName) {
                    void commands.executeCommand(
                        commandKey('api.executeChangeSet'),
                        this.stackName,
                        this.changeSetName
                    )
                    this.changeSetName = undefined
                    this.enableDeployments = false
                    this._view!.webview.html = this.getHtmlContent()
                }
            } else if (message.command === 'deleteChangeSet') {
                void commands.executeCommand(commandKey('stacks.deleteChangeSet'), {
                    stackName: this.stackName,
                    changeSetName: this.changeSetName,
                })
                this.changeSetName = undefined
                this.enableDeployments = false
                this._view!.webview.html = this.getHtmlContent()
            }
        })
    }

    private getHtmlContent(): string {
        const changes = this.changes

        if (!changes || changes.length === 0) {
            return `
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        body {
                            font-family: var(--vscode-font-family);
                            margin: 8px;
                            background-color: var(--vscode-editor-background);
                            color: var(--vscode-foreground);
                        }
                    </style>
                </head>
                <body>
                    <p>No changes detected for stack: ${this.stackName}</p>
                </body>
                </html>
            `
        }

        let tableHtml = `
            <table style="width: 100%; border-collapse: collapse; border: 1px solid var(--vscode-panel-border);">
                <tr>
                    <th style="width: 10%; word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px; color: var(--vscode-foreground); background-color: var(--vscode-editor-background);">Action</th>
                    <th style="width: 20%; word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px; color: var(--vscode-foreground); background-color: var(--vscode-editor-background);">LogicalResourceId</th>
                    <th style="width: 20%; word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px; color: var(--vscode-foreground); background-color: var(--vscode-editor-background);">PhysicalResourceId</th>
                    <th style="width: 10%; word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px; color: var(--vscode-foreground); background-color: var(--vscode-editor-background);">ResourceType</th>
                    <th style="width: 10%; word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px; color: var(--vscode-foreground); background-color: var(--vscode-editor-background);">Replacement</th>
                    <th style="width: 15%; word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px; color: var(--vscode-foreground); background-color: var(--vscode-editor-background);">Scope</th>
                    <th colspan="7" style="text-align: center; width: 15%; word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px; color: var(--vscode-foreground); background-color: var(--vscode-editor-background);">Details</th>
                </tr>
                <tr>
                    <th colspan="6" style="border: 1px solid var(--vscode-panel-border); background-color: var(--vscode-editor-background);"></th>
                    <th style="width: 10%; word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px; color: var(--vscode-foreground); background-color: var(--vscode-editor-background);">Name</th>
                    <th style="width: 10%; word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px; color: var(--vscode-foreground); background-color: var(--vscode-editor-background);">RequiresRecreation</th>
                    <th style="width: 20%; word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px; color: var(--vscode-foreground); background-color: var(--vscode-editor-background);">BeforeValue</th>
                    <th style="width: 20%; word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px; color: var(--vscode-foreground); background-color: var(--vscode-editor-background);">AfterValue</th>
                    <th style="width: 15%; word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px; color: var(--vscode-foreground); background-color: var(--vscode-editor-background);">AttributeChangeType</th>
                    <th style="width: 15%; word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px; color: var(--vscode-foreground); background-color: var(--vscode-editor-background);">ChangeSource</th>
                    <th style="width: 15%; word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px; color: var(--vscode-foreground); background-color: var(--vscode-editor-background);">CausingEntity</th>
                </tr>`

        for (const change of changes) {
            const rc = change.resourceChange
            if (!rc) {
                continue
            }

            const borderColor =
                rc.action === 'Add'
                    ? 'var(--vscode-gitDecoration-addedResourceForeground)'
                    : rc.action === 'Remove'
                      ? 'var(--vscode-gitDecoration-deletedResourceForeground)'
                      : rc.action === 'Modify'
                        ? 'var(--vscode-gitDecoration-modifiedResourceForeground)'
                        : 'transparent'

            const detailCount = rc.details?.length || 1
            tableHtml += `<tr style="border-left: 4px solid ${borderColor}; color: var(--vscode-foreground);">
                <td rowspan="${detailCount}" style="width: 10%; word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px; font-weight: bold; vertical-align: middle;">${rc.action ?? 'Unknown'}</td>
                <td rowspan="${detailCount}" style="width: 20%; word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px; vertical-align: middle;"><a href="#" onclick="openDiffToResource('${rc.logicalResourceId}'); return false;" style="color: var(--vscode-textLink-foreground); cursor: pointer; font-weight: bold; text-decoration: underline;">${rc.logicalResourceId ?? 'Unknown'}</a></td>
                <td rowspan="${detailCount}" style="width: 20%; word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px; vertical-align: middle;">${rc.physicalResourceId ?? ' '}</td>
                <td rowspan="${detailCount}" style="width: 10%; word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px; vertical-align: middle;">${rc.resourceType ?? 'Unknown'}</td>
                <td rowspan="${detailCount}" style="width: 10%; word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px; vertical-align: middle;">${rc.replacement ?? 'N/A'}</td>
                <td rowspan="${detailCount}" style="width: 15%; word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px; vertical-align: middle;">${rc.scope?.join(', ') ?? ' '}</td>`

            if (rc.details && rc.details.length > 0) {
                for (const [index, detail] of rc.details.entries()) {
                    const target = detail.Target
                    if (index > 0) {
                        tableHtml += `<tr style="border-left: 4px solid ${borderColor}; color: var(--vscode-foreground);">`
                    }
                    tableHtml += `
                        <td style="width: 10%; word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px;">${target?.Name ?? ' '}</td>
                        <td style="width: 10%; word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px;">${target?.RequiresRecreation ?? 'Unknown'}</td>
                        <td style="width: 20%; word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px;">${target?.BeforeValue ?? ' '}</td>
                        <td style="width: 20%; word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px;">${target?.AfterValue ?? ' '}</td>
                        <td style="width: 15%; word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px;">${target?.AttributeChangeType ?? ' '}</td>
                        <td style="width: 15%; word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px;">${detail?.ChangeSource ?? ' '}</td>
                        <td style="width: 15%; word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px;">${detail?.CausingEntity ?? ' '}</td>`
                    tableHtml += `</tr>`
                }
            } else {
                tableHtml += `
                    <td style="width: 10%; word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px;"></td>
                    <td style="width: 10%; word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px;"></td>
                    <td style="width: 20%; word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px;"></td>
                    <td style="width: 20%; word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px;"></td>
                    <td style="width: 15%; word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px;"></td>
                    <td style="width: 15%; word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px;"></td>
                    <td style="width: 15%; word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px;"></td>
                </tr>`
            }
        }

        tableHtml += `</table>`

        const viewDiffButton = `
            <div class="view-actions" style="margin: 10px 0; text-align: left; display: inline-block;">
                <button onclick="openDiff()" style="
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 8px 16px;
                    margin: 0 5px;
                    cursor: pointer;
                    border-radius: 2px;
                ">View Diff</button>
            </div>
        `

        const deploymentButtons =
            this.changeSetName && this.enableDeployments
                ? `
            <div class="deployment-actions" style="margin: 10px 0; text-align: left; display: inline-block;">
                <button id="confirmDeploy" onclick="confirmDeploy()" style="
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 8px 16px;
                    margin: 0 5px;
                    cursor: pointer;
                    border-radius: 2px;
                ">Deploy Changes</button>
                <button id="deleteChangeSet" onclick="deleteChangeSet()" style="
                    background-color: var(--vscode-button-secondaryBackground);
                    color: var(--vscode-button-secondaryForeground);
                    border: none;
                    padding: 8px 16px;
                    margin: 0 5px;
                    cursor: pointer;
                    border-radius: 2px;
                ">Delete Changeset</button>
            </div>
        `
                : ''

        return `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body {
                        font-family: var(--vscode-font-family);
                        margin: 8px;
                        background-color: var(--vscode-panel-background);
                        color: var(--vscode-panel-foreground);
                    }
                    a {
                        color: var(--vscode-textLink-foreground);
                        cursor: pointer;
                        text-decoration: none;
                    }
                    a:hover {
                        text-decoration: underline;
                    }
                </style>
            </head>
            <body>
                ${viewDiffButton}${deploymentButtons}
                ${tableHtml}
                <script>
                    const vscode = acquireVsCodeApi();
                    function openDiff() {
                        vscode.postMessage({ command: '${webviewCommandOpenDiff}' });
                    }
                    function openDiffToResource(resourceId) {
                        vscode.postMessage({ command: '${webviewCommandOpenDiff}', resourceId: resourceId });
                    }
                    function confirmDeploy() {
                        vscode.postMessage({ command: 'confirmDeploy' });
                    }
                    function deleteChangeSet() {
                        vscode.postMessage({ command: 'deleteChangeSet' });
                    }
                </script>
            </body>
            </html>
        `
    }
}
