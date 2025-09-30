import { StackSummary } from '@aws-sdk/client-cloudformation';
import { TreeItem, TreeItemCollapsibleState, ThemeIcon, ThemeColor, EventEmitter } from 'vscode';
import { SectionUI } from '../ui/SectionUI';

const StackSectionContext = 'stackSection';
const StackContext = 'stack';

export class StacksSectionUI implements SectionUI<StackTreeItem> {
    private stacks: StackSummary[] = [];
    private treeDataChanged?: EventEmitter<TreeItem | TreeItem[] | undefined | null | void>;

    public base = new StackTreeItem('Stacks', TreeItemCollapsibleState.Expanded, StackSectionContext);

    registerTreeChangedEvent(treeDataChanged: EventEmitter<TreeItem | TreeItem[] | undefined | null | void>) {
        this.treeDataChanged = treeDataChanged;
    }

    onChange() {
        return (stacks: StackSummary[]) => {
            this.stacks = [...stacks];
            this.refreshUI();
        };
    }

    private refreshUI() {
        this.treeDataChanged?.fire();
    }

    children(element?: StackTreeItem): StackTreeItem[] {
        if (!element) {
            return [this.base];
        }

        if (element.contextValue === StackSectionContext) {
            return this.stacks.map((stack) => {
                return new StackTreeItem(
                    stack.StackName ?? 'Unknown Stack',
                    TreeItemCollapsibleState.Collapsed,
                    StackContext,
                    undefined,
                    `${stack.StackName} [${stack.StackStatus}]`,
                    this.getStackIcon(stack.StackStatus),
                    stack,
                );
            });
        }

        if (element.contextValue === StackContext && element.stack) {
            const details = [];
            const stack = element.stack;

            details.push(
                new StackTreeItem(
                    `${stack.StackId}`,
                    TreeItemCollapsibleState.None,
                    'detail',
                    undefined,
                    undefined,
                    new ThemeIcon('tag'),
                ),
            );

            details.push(
                new StackTreeItem(
                    `[${stack.StackStatus}]`,
                    TreeItemCollapsibleState.None,
                    'detail',
                    undefined,
                    undefined,
                    this.getStackIcon(stack.StackStatus),
                ),
            );

            if (stack.TemplateDescription) {
                details.push(
                    new StackTreeItem(
                        `${stack.TemplateDescription}`,
                        TreeItemCollapsibleState.None,
                        'detail',
                        undefined,
                        undefined,
                        new ThemeIcon('note'),
                    ),
                );
            }

            if (stack.StackStatusReason) {
                details.push(
                    new StackTreeItem(
                        `Reason: ${stack.StackStatusReason}`,
                        TreeItemCollapsibleState.None,
                        'detail',
                        undefined,
                        undefined,
                        new ThemeIcon('comment'),
                    ),
                );
            }

            if (stack.CreationTime) {
                details.push(
                    new StackTreeItem(
                        `Created: ${new Date(stack.CreationTime).toLocaleString()}`,
                        TreeItemCollapsibleState.None,
                        'detail',
                        undefined,
                        undefined,
                        new ThemeIcon('calendar'),
                    ),
                );
            }

            if (stack.LastUpdatedTime) {
                details.push(
                    new StackTreeItem(
                        `Updated: ${new Date(stack.LastUpdatedTime).toLocaleString()}`,
                        TreeItemCollapsibleState.None,
                        'detail',
                        undefined,
                        undefined,
                        new ThemeIcon('history'),
                    ),
                );
            }

            return details;
        }

        return [];
    }

    private getStackIcon(status?: string): ThemeIcon {
        if (!status) return new ThemeIcon('layers');

        if (status.includes('COMPLETE')) {
            return new ThemeIcon('check', new ThemeColor('charts.green'));
        } else if (status.includes('FAILED') || status.includes('ROLLBACK')) {
            return new ThemeIcon('error', new ThemeColor('charts.red'));
        } else if (status.includes('PROGRESS')) {
            return new ThemeIcon('sync~spin', new ThemeColor('charts.yellow'));
        } else {
            return new ThemeIcon('layers');
        }
    }
}

export class StackTreeItem extends TreeItem {
    constructor(
        public override readonly label: string,
        public override readonly collapsibleState: TreeItemCollapsibleState,
        public override readonly contextValue: string,
        public override readonly description?: string,
        tooltip?: string,
        icon?: ThemeIcon,
        public readonly stack?: StackSummary,
    ) {
        super(label, collapsibleState);
        this.tooltip = tooltip ?? `${this.label}${this.description ? ` - ${this.description}` : ''}`;

        if (icon) {
            this.iconPath = icon;
        } else if (contextValue === StackContext) {
            this.iconPath = new ThemeIcon('layers');
        } else if (contextValue === 'section') {
            this.iconPath = new ThemeIcon('cloud');
        } else if (contextValue === 'detail') {
            this.iconPath = new ThemeIcon('info');
        } else if (contextValue === 'loading') {
            this.iconPath = new ThemeIcon('loading~spin');
        }
    }
}
