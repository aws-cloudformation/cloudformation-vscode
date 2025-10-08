import { CancellationToken, CodeLens, CodeLensProvider, Event, EventEmitter, TextDocument } from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';

const CODE_LENS_REQUEST = 'textDocument/codeLens';

export class StackActionCodeLensProvider implements CodeLensProvider {
    private readonly _onDidChangeCodeLenses = new EventEmitter<void>();
    public readonly onDidChangeCodeLenses: Event<void> = this._onDidChangeCodeLenses.event;

    constructor(private readonly client: LanguageClient) {}

    async provideCodeLenses(document: TextDocument, token: CancellationToken): Promise<CodeLens[]> {
        if (token.isCancellationRequested) {
            return [];
        }

        const result = await this.client.sendRequest<CodeLens[]>(
            CODE_LENS_REQUEST,
            { textDocument: { uri: document.uri.toString() } },
            token,
        );

        return result || [];
    }

    refresh(): void {
        this._onDidChangeCodeLenses.fire();
    }
}
