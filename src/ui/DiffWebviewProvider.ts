import { WebviewView, WebviewViewProvider } from 'vscode';
import { ResourceChangeDetail } from '@aws-sdk/client-cloudformation';
import { StackChange } from '../stacks/actions/StackActionRequestType';
import { DiffViewHelper } from './DiffViewHelper';

const WEBVIEW_COMMAND_OPEN_DIFF = 'openDiff';

export class DiffWebviewProvider implements WebviewViewProvider {
    private _view?: WebviewView;
    private stackName = '';
    private changes: StackChange[] = [];

    updateData(stackName: string, changes: StackChange[] = []) {
        this.stackName = stackName;
        this.changes = changes;
        if (this._view) {
            this._view.webview.html = this.getHtmlContent();
        }
    }

    resolveWebviewView(webviewView: WebviewView) {
        this._view = webviewView;
        webviewView.webview.options = { enableScripts: true };
        webviewView.webview.html = this.getHtmlContent();

        webviewView.webview.onDidReceiveMessage((message: { command: string; resourceId?: string }) => {
            if (message.command === WEBVIEW_COMMAND_OPEN_DIFF) {
                void DiffViewHelper.openDiff(this.stackName, this.changes, message.resourceId);
            }
        });
    }

    private getHtmlContent(): string {
        const changes = this.changes;

        if (!changes || changes.length === 0) {
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
                    </style>
                </head>
                <body>
                    <p>No changes detected for stack: ${this.stackName}</p>
                </body>
                </html>
            `;
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
                    <th colspan="6" style="text-align: center; width: 15%; word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px; color: var(--vscode-foreground); background-color: var(--vscode-editor-background);">Details</th>
                </tr>
                <tr>
                    <th colspan="6" style="border: 1px solid var(--vscode-panel-border); background-color: var(--vscode-editor-background);"></th>
                    <th style="width: 10%; word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px; color: var(--vscode-foreground); background-color: var(--vscode-editor-background);">Attribute</th>
                    <th style="width: 10%; word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px; color: var(--vscode-foreground); background-color: var(--vscode-editor-background);">Name</th>
                    <th style="width: 10%; word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px; color: var(--vscode-foreground); background-color: var(--vscode-editor-background);">RequiresRecreation</th>
                    <th style="width: 20%; word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px; color: var(--vscode-foreground); background-color: var(--vscode-editor-background);">BeforeValue</th>
                    <th style="width: 20%; word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px; color: var(--vscode-foreground); background-color: var(--vscode-editor-background);">AfterValue</th>
                    <th style="width: 15%; word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px; color: var(--vscode-foreground); background-color: var(--vscode-editor-background);">AttributeChangeType</th>
                </tr>`;

        changes.forEach((change) => {
            const rc = change.resourceChange;
            if (!rc) return;

            const bgColor =
                rc.action === 'Add'
                    ? 'rgba(0, 255, 0, 0.8)'
                    : rc.action === 'Remove'
                      ? 'rgba(255, 0, 0, 0.8)'
                      : rc.action === 'Modify'
                        ? 'rgba(255, 165, 0, 0.8)'
                        : 'transparent';

            tableHtml += `<tr style="background-color: ${bgColor};">
                <td style="width: 10%; word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px; font-weight: bold;">${rc.action ?? 'Unknown'}</td>
                <td style="width: 20%; word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px;"><a href="#" onclick="openDiffToResource('${rc.logicalResourceId}'); return false;" style="color: #0066ff; cursor: pointer; font-weight: bold; text-decoration: underline;">${rc.logicalResourceId ?? 'Unknown'}</a></td>
                <td style="width: 20%; word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px;">${rc.physicalResourceId ?? ' '}</td>
                <td style="width: 10%; word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px;">${rc.resourceType ?? 'Unknown'}</td>
                <td style="width: 10%; word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px;">${rc.replacement ?? 'N/A'}</td>
                <td style="width: 15%; word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px;">${rc.scope?.join(', ') ?? ' '}</td>`;

            if (rc.details && rc.details.length > 0) {
                rc.details.forEach((detail: ResourceChangeDetail, index: number) => {
                    const target = detail.Target;
                    if (index > 0) {
                        tableHtml += `<tr style="background-color: ${bgColor};"><td colspan="6" style="border: 1px solid var(--vscode-panel-border);"></td>`;
                    }
                    tableHtml += `
                        <td style="width: 10%; word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px;">${target?.Attribute ?? 'Unknown'}</td>
                        <td style="width: 10%; word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px;">${target?.Name ?? ' '}</td>
                        <td style="width: 10%; word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px;">${target?.RequiresRecreation ?? 'Unknown'}</td>
                        <td style="width: 20%; word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px;">${target?.BeforeValue ?? ' '}</td>
                        <td style="width: 20%; word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px;">${target?.AfterValue ?? ' '}</td>
                        <td style="width: 15%; word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px;">${target?.AttributeChangeType ?? ' '}</td>`;
                    if (index > 0) {
                        tableHtml += `</tr>`;
                    }
                });
            } else {
                tableHtml += `
                    <td style="width: 10%; word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px;"></td>
                    <td style="width: 10%; word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px;"></td>
                    <td style="width: 10%; word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px;"></td>
                    <td style="width: 20%; word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px;"></td>
                    <td style="width: 20%; word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px;"></td>
                    <td style="width: 15%; word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px;"></td>`;
            }
            tableHtml += `</tr>`;
        });

        tableHtml += `</table>`;

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
                <p><a href="#" onclick="openDiff(); return false;">View Side-by-Side Diff</a></p>
                ${tableHtml}
                <script>
                    const vscode = acquireVsCodeApi();
                    function openDiff() {
                        vscode.postMessage({ command: '${WEBVIEW_COMMAND_OPEN_DIFF}' });
                    }
                    function openDiffToResource(resourceId) {
                        vscode.postMessage({ command: '${WEBVIEW_COMMAND_OPEN_DIFF}', resourceId: resourceId });
                    }
                </script>
            </body>
            </html>
        `;
    }
}
