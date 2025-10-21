/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { TreeItemCollapsibleState } from 'vscode'
import { AWSTreeNodeBase } from '../../../../shared/treeview/nodes/awsTreeNodeBase'
import { ResourceList } from '../../cfn/resourceRequestTypes'
import { ResourceNode } from './resourceNode'
import { commandKey } from '../../utils'

class LoadMoreResourcesNode extends AWSTreeNodeBase {
    public constructor(private readonly parent: ResourceTypeNode) {
        super('[Load More...]', TreeItemCollapsibleState.None)
        this.contextValue = 'loadMoreResources'
        this.command = {
            title: 'Load More',
            command: commandKey('api.loadMoreResources'),
            arguments: [this.parent],
        }
    }
}

export class ResourceTypeNode extends AWSTreeNodeBase {
    private readonly pageSize = 50
    private currentIndex = 0
    private loadedChildren: ResourceNode[] = []

    public constructor(private readonly resourceList: ResourceList) {
        super(resourceList.typeName, TreeItemCollapsibleState.Collapsed)
        this.contextValue = 'resourceType'
        this.description = `(${resourceList.resourceIdentifiers.length})`
    }

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        if (this.loadedChildren.length === 0) {
            this.loadMoreResources()
        }

        const hasMore = this.currentIndex < this.resourceList.resourceIdentifiers.length
        return hasMore ? [...this.loadedChildren, new LoadMoreResourcesNode(this)] : this.loadedChildren
    }

    public loadMoreResources(): void {
        const endIndex = Math.min(this.currentIndex + this.pageSize, this.resourceList.resourceIdentifiers.length)
        const pageIdentifiers = this.resourceList.resourceIdentifiers.slice(this.currentIndex, endIndex)

        const newNodes = pageIdentifiers.map(
            (identifier) =>
                new ResourceNode(
                    { name: identifier, resourceIdentifier: identifier },
                    this.resourceList.typeName,
                    identifier
                )
        )

        this.loadedChildren.push(...newNodes)
        this.currentIndex = endIndex
    }
}
