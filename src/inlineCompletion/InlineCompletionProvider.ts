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
import { LoggerFactory } from '../utils/Logger';

export class CfnInlineCompletionProvider implements InlineCompletionItemProvider {
    constructor(private readonly client: LanguageClient) {}

    private get log() {
        return LoggerFactory.getLogger('InlineCompletion');
    }

    async provideInlineCompletionItems(
        document: TextDocument,
        position: Position,
        context: InlineCompletionContext,
        token: CancellationToken,
    ): Promise<InlineCompletionItem[] | undefined> {
        if (!this.client.isRunning()) {
            return;
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
            return;
        } catch (error) {
            if (token.isCancellationRequested) {
                return;
            }
            this.log.error(error, 'Inline completion error');
            return;
        }
    }
}
