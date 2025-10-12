/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { SectionUI } from '../ui/sectionUI'
import { EventEmitter, TreeItem, TreeItemCollapsibleState } from 'vscode'
import { ResourceContextValue, ResourceSectionContextValue, ResourceTypeContextValue } from '../explorer/contextValue'
import { ResourceList } from '../cfn/resourceRequestTypes'
import { ResourceNode } from '../explorer/nodes/resourceNode'
import { RefreshResourceListCommand, SelectResourceTypeCommand } from '../commands/cfnCommands'

export class ResourcesSectionUI implements SectionUI<ResourceNode> {
    private resources: ResourceList[] = []
    private treeDataChanged?: EventEmitter<TreeItem | TreeItem[] | undefined | null | void>

    public base = new ResourceNode(
        ResourceSectionContextValue,
        TreeItemCollapsibleState.Collapsed,
        ResourceSectionContextValue
    )

    registerTreeChangedEvent(event: EventEmitter<TreeItem | TreeItem[] | void | null | undefined>): void {
        this.treeDataChanged = event
    }

    onChange() {
        return (resources: ResourceList[]) => {
            this.resources = [...resources]
            this.refreshUi()
        }
    }

    private refreshUi() {
        this.treeDataChanged?.fire()
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
                    SelectResourceTypeCommand
                ),
            ]
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
                    RefreshResourceListCommand
                )
            })
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
                    identifier
                )
            })
        }
        return []
    }
}
