import { NotificationType } from 'vscode-languageserver-protocol';
import { LanguageClient } from 'vscode-languageclient/node';

export type DocumentMetadata = {
    uri: string;
    fileName: string;
    ext: string;
    type: string;
    cfnType: string;
    languageId: string;
    version: number;
    lineCount: number;
};

const DocumentsMetadataNotification = new NotificationType<DocumentMetadata[]>('aws/documents/metadata');

type DocumentsChangeListener = (documents: DocumentMetadata[]) => void;

export class DocumentManager {
    private documents: DocumentMetadata[] = [];
    private readonly listeners: DocumentsChangeListener[] = [];

    constructor(private readonly client: LanguageClient) {
        this.client.onNotification(DocumentsMetadataNotification, (documents) => {
            this.documents = documents;
            this.listeners.forEach((listener) => {
                listener(this.documents);
            });
        });
    }

    addListener(listener: DocumentsChangeListener) {
        this.listeners.push(listener);
    }

    get() {
        return [...this.documents];
    }
}
