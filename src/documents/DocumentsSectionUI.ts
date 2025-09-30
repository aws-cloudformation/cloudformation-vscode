import { TreeItem, ThemeIcon, EventEmitter, TreeItemCollapsibleState } from 'vscode';
import { DocumentMetadata } from './DocumentManager';
import { SectionUI } from '../ui/SectionUI';

const DocumentSectionContext = 'documentSection';
const DocumentContext = 'document';

export class DocumentsSectionUI implements SectionUI<DocumentTreeItem> {
    private documents: DocumentMetadata[] = [];
    private treeDataChanged?: EventEmitter<TreeItem | TreeItem[] | undefined | null | void>;

    public base = new DocumentTreeItem('Documents', TreeItemCollapsibleState.Expanded, DocumentSectionContext);

    registerTreeChangedEvent(treeDataChanged: EventEmitter<TreeItem | TreeItem[] | undefined | null | void>) {
        this.treeDataChanged = treeDataChanged;
    }

    onChange() {
        return (documents: DocumentMetadata[]) => {
            this.documents = documents.filter((doc) => {
                return doc.cfnType !== 'unknown';
            });
            this.refreshUI();
        };
    }

    private refreshUI() {
        this.treeDataChanged?.fire();
    }

    children(element?: DocumentTreeItem): DocumentTreeItem[] {
        if (!element) {
            return [this.base];
        }

        if (element.contextValue === DocumentSectionContext) {
            return this.documents.map((doc) => {
                return new DocumentTreeItem(
                    doc.fileName,
                    TreeItemCollapsibleState.None,
                    DocumentContext,
                    this.getDescription(doc),
                    `File: ${doc.uri}\nType: ${doc.type}\nCloudFormation Type: ${doc.cfnType}`,
                    this.getIcon(doc),
                    doc,
                );
            });
        }

        return [];
    }

    private getDescription(doc: DocumentMetadata): string {
        if (doc.cfnType !== 'unknown') {
            return `${doc.type} • ${doc.cfnType}`;
        }
        return doc.type;
    }

    private getIcon(doc: DocumentMetadata): ThemeIcon {
        if (doc.cfnType === 'template') {
            return new ThemeIcon('file-code');
        }
        if (doc.cfnType === 'gitsync-deployment') {
            return new ThemeIcon('git-branch');
        }
        if (doc.type === 'YAML') {
            return new ThemeIcon('file-text');
        }
        if (doc.type === 'JSON') {
            return new ThemeIcon('json');
        }
        return new ThemeIcon('file');
    }
}

export class DocumentTreeItem extends TreeItem {
    constructor(
        public override readonly label: string,
        public override readonly collapsibleState: TreeItemCollapsibleState,
        public override readonly contextValue: string,
        public override readonly description?: string,
        tooltip?: string,
        icon?: ThemeIcon,
        public readonly document?: DocumentMetadata,
    ) {
        super(label, collapsibleState);
        this.tooltip = tooltip ?? `${this.label}${this.description ? ` - ${this.description}` : ''}`;

        if (icon) {
            this.iconPath = icon;
        } else if (contextValue === DocumentContext) {
            this.iconPath = new ThemeIcon('file');
        } else if (contextValue === 'section') {
            this.iconPath = new ThemeIcon('folder');
        }
    }
}
