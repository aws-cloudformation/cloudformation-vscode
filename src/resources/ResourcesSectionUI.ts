import { SectionUI } from '../ui/SectionUI';
import { EventEmitter, TreeItem, TreeItemCollapsibleState } from 'vscode';
import { ResourceContextValue, ResourceSectionContextValue, ResourceTypeContextValue } from '../treeview/ContextValue';
import { ResourceList } from '../cfn/ResourceRequestTypes';
import { ResourceNode } from '../treeview/nodes/ResourceNode';
import { RefreshResourceListCommand, SelectResourceTypeCommand } from '../commands/CfnCommands';

export class ResourcesSectionUI implements SectionUI<ResourceNode> {
    private resources: ResourceList[] = [];
    private treeDataChanged?: EventEmitter<TreeItem | TreeItem[] | undefined | null | void>;

    public base = new ResourceNode(
        ResourceSectionContextValue,
        TreeItemCollapsibleState.Collapsed,
        ResourceSectionContextValue,
    );

    registerTreeChangedEvent(event: EventEmitter<TreeItem | TreeItem[] | void | null | undefined>): void {
        this.treeDataChanged = event;
    }

    onChange() {
        return (resources: ResourceList[]) => {
            this.resources = [...resources];
            this.refreshUi();
        };
    }

    private refreshUi() {
        this.treeDataChanged?.fire();
    }

    children(element?: ResourceNode): ResourceNode[] {
        if (!element) {
            return [
                new ResourceNode(
                    'Resources',
                    TreeItemCollapsibleState.Expanded,
                    ResourceSectionContextValue,
                    undefined,
                    'Resources in account grouped by type',
                    undefined,
                    SelectResourceTypeCommand,
                ),
            ];
        }

        if (element.contextValue === ResourceSectionContextValue) {
            return this.resources.map((resource) => {
                return new ResourceNode(
                    resource.typeName,
                    TreeItemCollapsibleState.Collapsed,
                    ResourceTypeContextValue,
                    undefined,
                    `${resource.typeName} (${resource.resourceIdentifiers.length})`,
                    resource,
                    RefreshResourceListCommand,
                );
            });
        }

        if (element.contextValue === ResourceTypeContextValue && element.resourceList) {
            return element.resourceList.resourceIdentifiers.map((identifier: string) => {
                return new ResourceNode(
                    identifier,
                    TreeItemCollapsibleState.None,
                    ResourceContextValue,
                    undefined,
                    identifier,
                    element.resourceList,
                    undefined,
                    identifier,
                );
            });
        }
        return [];
    }
}
