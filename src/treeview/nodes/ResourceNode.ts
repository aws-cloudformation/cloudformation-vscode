import { Command, TreeItem, TreeItemCollapsibleState } from 'vscode';
import { ResourceList } from '../../cfn/ResourceRequestTypes';

export class ResourceNode extends TreeItem {
    public readonly resourceType?: string;
    constructor(
        public override readonly label: string,
        public override readonly collapsibleState: TreeItemCollapsibleState,
        public override readonly contextValue: string,
        public override readonly description?: string,
        public override readonly tooltip?: string,
        public readonly resourceList?: ResourceList,
        public override readonly command?: Command,
        public readonly resourceIdentifier?: string,
    ) {
        super(label, collapsibleState);
        this.tooltip = tooltip ?? `${this.label}${this.description ? ` - ${this.description}` : ''}`;

        if (resourceList?.typeName) {
            this.resourceType = resourceList?.typeName;
        }
    }
}
