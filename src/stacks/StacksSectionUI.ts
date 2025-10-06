import { StackSummary } from '@aws-sdk/client-cloudformation';
import { TreeItem, TreeItemCollapsibleState, ThemeIcon, ThemeColor, EventEmitter } from 'vscode';
import { SectionUI } from '../ui/SectionUI';

const StackSectionContext = 'stackSection';
const StackContext = 'stack';

const STACK_STATUS_ICONS: Record<string, { icon: string; color: string }> = {
    // Create operations
    CREATE_IN_PROGRESS: { icon: 'sync~spin', color: 'charts.yellow' },
    CREATE_FAILED: { icon: 'error', color: 'charts.red' },
    CREATE_COMPLETE: { icon: 'check', color: 'charts.green' },

    // Rollback operations
    ROLLBACK_IN_PROGRESS: { icon: 'sync~spin', color: 'charts.yellow' },
    ROLLBACK_FAILED: { icon: 'error', color: 'charts.red' },
    ROLLBACK_COMPLETE: { icon: 'error', color: 'charts.red' },

    // Delete operations
    DELETE_IN_PROGRESS: { icon: 'sync~spin', color: 'charts.yellow' },
    DELETE_FAILED: { icon: 'error', color: 'charts.red' },
    DELETE_COMPLETE: { icon: 'check', color: 'charts.green' },

    // Update operations
    UPDATE_IN_PROGRESS: { icon: 'sync~spin', color: 'charts.yellow' },
    UPDATE_COMPLETE_CLEANUP_IN_PROGRESS: { icon: 'sync~spin', color: 'charts.yellow' },
    UPDATE_COMPLETE: { icon: 'check', color: 'charts.green' },
    UPDATE_FAILED: { icon: 'error', color: 'charts.red' },

    // Update rollback operations
    UPDATE_ROLLBACK_IN_PROGRESS: { icon: 'sync~spin', color: 'charts.yellow' },
    UPDATE_ROLLBACK_FAILED: { icon: 'error', color: 'charts.red' },
    UPDATE_ROLLBACK_COMPLETE_CLEANUP_IN_PROGRESS: { icon: 'sync~spin', color: 'charts.yellow' },
    UPDATE_ROLLBACK_COMPLETE: { icon: 'error', color: 'charts.red' },

    // Review and import operations
    REVIEW_IN_PROGRESS: { icon: 'sync~spin', color: 'charts.yellow' },
    IMPORT_IN_PROGRESS: { icon: 'sync~spin', color: 'charts.yellow' },
    IMPORT_COMPLETE: { icon: 'check', color: 'charts.green' },
    IMPORT_ROLLBACK_IN_PROGRESS: { icon: 'sync~spin', color: 'charts.yellow' },
    IMPORT_ROLLBACK_FAILED: { icon: 'error', color: 'charts.red' },
    IMPORT_ROLLBACK_COMPLETE: { icon: 'error', color: 'charts.red' },
};

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

        const statusConfig = STACK_STATUS_ICONS[status];
        if (statusConfig) {
            return new ThemeIcon(statusConfig.icon, new ThemeColor(statusConfig.color));
        }

        return new ThemeIcon('layers');
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
