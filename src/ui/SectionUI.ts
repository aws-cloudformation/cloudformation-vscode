import { EventEmitter, TreeItem } from 'vscode';

export interface SectionUI<T extends TreeItem = TreeItem> {
    base: TreeItem;
    children(element?: T): (T | null | undefined)[];
    registerTreeChangedEvent(event: EventEmitter<TreeItem | TreeItem[] | undefined | null | void>): void;
    onChange: () => void;
}
