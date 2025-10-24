import { TreeItem, TreeItemCollapsibleState, ThemeIcon, Command } from 'vscode'

export class EnvironmentNode extends TreeItem {
    constructor(
        public override label: string,
        public override collapsibleState: TreeItemCollapsibleState,
        public override contextValue: string,
        public override description?: string,
        public environmentName?: string,
        public override command?: Command
    ) {
        super(label, collapsibleState)
        this.iconPath = new ThemeIcon('settings-gear')
    }
}
