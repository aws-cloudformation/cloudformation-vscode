import { WebviewView, WebviewViewProvider } from 'vscode';
import { ResourceChangeDetail } from '@aws-sdk/client-cloudformation';
import { StackChange } from '../cfn/StackActionRequestType';

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
            <table style="width: 100%; border-collapse: collapse; border: 1px solid #ccc;">
                <tr>
                    <th style="width: 10%; word-wrap: break-word; border: 1px solid #ccc; padding: 4px; color: var(--vscode-foreground);">Action</th>
                    <th style="width: 20%; word-wrap: break-word; border: 1px solid #ccc; padding: 4px; color: var(--vscode-foreground);">LogicalResourceId</th>
                    <th style="width: 20%; word-wrap: break-word; border: 1px solid #ccc; padding: 4px; color: var(--vscode-foreground);">PhysicalResourceId</th>
                    <th style="width: 10%; word-wrap: break-word; border: 1px solid #ccc; padding: 4px; color: var(--vscode-foreground);">ResourceType</th>
                    <th style="width: 10%; word-wrap: break-word; border: 1px solid #ccc; padding: 4px; color: var(--vscode-foreground);">Replacement</th>
                    <th style="width: 15%; word-wrap: break-word; border: 1px solid #ccc; padding: 4px; color: var(--vscode-foreground);">Scope</th>
                    <th colspan="6" style="text-align: center; width: 15%; word-wrap: break-word; border: 1px solid #ccc; padding: 4px; color: var(--vscode-foreground);">Details</th>
                </tr>
                <tr>
                    <th colspan="6" style="border: 1px solid #ccc;"></th>
                    <th style="width: 10%; word-wrap: break-word; border: 1px solid #ccc; padding: 4px; color: var(--vscode-foreground);">Attribute</th>
                    <th style="width: 10%; word-wrap: break-word; border: 1px solid #ccc; padding: 4px; color: var(--vscode-foreground);">Name</th>
                    <th style="width: 10%; word-wrap: break-word; border: 1px solid #ccc; padding: 4px; color: var(--vscode-foreground);">RequiresRecreation</th>
                    <th style="width: 20%; word-wrap: break-word; border: 1px solid #ccc; padding: 4px; color: var(--vscode-foreground);">BeforeValue</th>
                    <th style="width: 20%; word-wrap: break-word; border: 1px solid #ccc; padding: 4px; color: var(--vscode-foreground);">AfterValue</th>
                    <th style="width: 15%; word-wrap: break-word; border: 1px solid #ccc; padding: 4px; color: var(--vscode-foreground);">AttributeChangeType</th>
                </tr>`;

        changes.forEach((change) => {
            const rc = change.resourceChange;
            if (!rc) return;

            tableHtml += `<tr>
                <td style="width: 10%; word-wrap: break-word; border: 1px solid #ccc; padding: 4px; color: var(--vscode-foreground);">${rc.action ?? 'Unknown'}</td>
                <td style="width: 20%; word-wrap: break-word; border: 1px solid #ccc; padding: 4px; color: var(--vscode-foreground);">${rc.logicalResourceId ?? 'Unknown'}</td>
                <td style="width: 20%; word-wrap: break-word; border: 1px solid #ccc; padding: 4px; color: var(--vscode-foreground);">${rc.physicalResourceId ?? ' '}</td>
                <td style="width: 10%; word-wrap: break-word; border: 1px solid #ccc; padding: 4px; color: var(--vscode-foreground);">${rc.resourceType ?? 'Unknown'}</td>
                <td style="width: 10%; word-wrap: break-word; border: 1px solid #ccc; padding: 4px; color: var(--vscode-foreground);">${rc.replacement ?? 'N/A'}</td>
                <td style="width: 15%; word-wrap: break-word; border: 1px solid #ccc; padding: 4px; color: var(--vscode-foreground);">${rc.scope?.join(', ') ?? ' '}</td>`;

            if (rc.details && rc.details.length > 0) {
                rc.details.forEach((detail: ResourceChangeDetail, index: number) => {
                    const target = detail.Target;
                    if (index > 0) {
                        tableHtml += `<tr><td colspan="6" style="border: 1px solid #ccc;"></td>`;
                    }
                    tableHtml += `
                        <td style="width: 10%; word-wrap: break-word; border: 1px solid #ccc; padding: 4px; color: var(--vscode-foreground);">${target?.Attribute ?? 'Unknown'}</td>
                        <td style="width: 10%; word-wrap: break-word; border: 1px solid #ccc; padding: 4px; color: var(--vscode-foreground);">${target?.Name ?? ' '}</td>
                        <td style="width: 10%; word-wrap: break-word; border: 1px solid #ccc; padding: 4px; color: var(--vscode-foreground);">${target?.RequiresRecreation ?? 'Unknown'}</td>
                        <td style="width: 20%; word-wrap: break-word; border: 1px solid #ccc; padding: 4px; color: var(--vscode-foreground);">${target?.BeforeValue ?? ' '}</td>
                        <td style="width: 20%; word-wrap: break-word; border: 1px solid #ccc; padding: 4px; color: var(--vscode-foreground);">${target?.AfterValue ?? ' '}</td>
                        <td style="width: 15%; word-wrap: break-word; border: 1px solid #ccc; padding: 4px; color: var(--vscode-foreground);">${target?.AttributeChangeType ?? ' '}</td>`;
                    if (index > 0) {
                        tableHtml += `</tr>`;
                    }
                });
            } else {
                tableHtml += `
                    <td style="width: 10%; word-wrap: break-word; border: 1px solid #ccc; padding: 4px; color: var(--vscode-foreground);"></td>
                    <td style="width: 10%; word-wrap: break-word; border: 1px solid #ccc; padding: 4px; color: var(--vscode-foreground);"></td>
                    <td style="width: 10%; word-wrap: break-word; border: 1px solid #ccc; padding: 4px; color: var(--vscode-foreground);"></td>
                    <td style="width: 20%; word-wrap: break-word; border: 1px solid #ccc; padding: 4px; color: var(--vscode-foreground);"></td>
                    <td style="width: 20%; word-wrap: break-word; border: 1px solid #ccc; padding: 4px; color: var(--vscode-foreground);"></td>
                    <td style="width: 15%; word-wrap: break-word; border: 1px solid #ccc; padding: 4px; color: var(--vscode-foreground);"></td>`;
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
                </style>
            </head>
            <body>
                ${tableHtml}
            </body>
            </html>
        `;
    }
}
