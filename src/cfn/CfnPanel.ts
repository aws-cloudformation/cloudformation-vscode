import { TreeDataProvider, TreeItem, EventEmitter, Event } from 'vscode';
import { SectionUI } from '../ui/SectionUI';

export class CfnPanel implements TreeDataProvider<TreeItem> {
    private readonly _onDidChangeTreeData = new EventEmitter<TreeItem | TreeItem[] | undefined | null | void>();
    readonly onDidChangeTreeData: Event<TreeItem | TreeItem[] | undefined | null | void> =
        this._onDidChangeTreeData.event;

    constructor(private readonly treeDataProviders: SectionUI[]) {
        treeDataProviders.forEach((tree) => {
            tree.registerTreeChangedEvent(this._onDidChangeTreeData);
        });
    }

    getTreeItem(element: TreeItem): TreeItem {
        return element;
    }

    getChildren(element?: TreeItem): TreeItem[] {
        return this.treeDataProviders.flatMap((provider) => {
            return provider.children(element).filter((child) => {
                return child !== undefined && child !== null;
            });
        });
    }
}
