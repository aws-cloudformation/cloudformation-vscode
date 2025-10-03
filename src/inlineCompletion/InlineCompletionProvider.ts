import {
    CancellationToken,
    InlineCompletionContext,
    InlineCompletionItem,
    InlineCompletionItemProvider,
    InlineCompletionList,
    Position,
    TextDocument,
} from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';

export class CfnInlineCompletionProvider implements InlineCompletionItemProvider {
    constructor(private readonly client: LanguageClient) {}

    async provideInlineCompletionItems(
        document: TextDocument,
        position: Position,
        context: InlineCompletionContext,
        token: CancellationToken,
    ): Promise<InlineCompletionItem[] | null> {
        if (!this.client.isRunning()) {
            return null;
        }

        try {
            const result = await this.client.sendRequest<InlineCompletionList | null>(
                'textDocument/inlineCompletion',
                {
                    textDocument: { uri: document.uri.toString() },
                    position: { line: position.line, character: position.character },
                    context: {
                        triggerKind: context.triggerKind,
                        selectedCompletionInfo: context.selectedCompletionInfo,
                    },
                },
                token,
            );

            if (result) {
                return result.items;
            }
            return null;
        } catch (error) {
            if (token.isCancellationRequested) {
                return null;
            }
            console.error('Inline completion error:', error);
            return null;
        }
    }
}
