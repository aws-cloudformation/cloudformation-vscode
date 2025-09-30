import { ViewColumn } from 'vscode';
import { docPreview } from '../documents/DocumentPreview';

export async function htmlPreview(content: unknown, title: string) {
    if (typeof content !== 'string') {
        return;
    }

    await docPreview({
        content: `# ${title}\n${content}`,
        language: 'markdown',
        viewColumn: ViewColumn.Beside,
        preserveFocus: true,
    });
}
