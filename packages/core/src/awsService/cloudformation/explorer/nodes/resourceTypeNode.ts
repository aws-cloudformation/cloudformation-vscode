/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { TreeItemCollapsibleState } from 'vscode'
import { AWSTreeNodeBase } from '../../../../shared/treeview/nodes/awsTreeNodeBase'
import { ResourceList } from '../../cfn/resourceRequestTypes'
import { ResourceNode } from './resourceNode'
import { commandKey } from '../../utils'
import { ResourcesManager } from '../../resources/resourcesManager'

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
    private nextToken?: string

    public constructor(
        private readonly resourceList: ResourceList,
        private readonly resourcesManager: ResourcesManager
    ) {
        super(resourceList.typeName, TreeItemCollapsibleState.Collapsed)
        this.nextToken = resourceList.nextToken
        this.updateNode()
    }

    private updateNode(): void {
        const count = this.resourceList.resourceIdentifiers.length
        const hasMore = this.nextToken !== undefined
        this.description = hasMore ? `(${count}+)` : `(${count})`
        this.contextValue = hasMore ? 'resourceTypeWithMore' : 'resourceType'
    }

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        const nodes = this.resourceList.resourceIdentifiers.map(
            (identifier) => new ResourceNode(identifier, this.resourceList.typeName)
        )

        return this.nextToken ? [...nodes, new LoadMoreResourcesNode(this)] : nodes
    }

    public async loadMoreResources(): Promise<void> {
        if (!this.nextToken) {
            return
        }

        await this.resourcesManager.loadMoreResources(this.resourceList.typeName, this.nextToken)

        // Update from manager after load
        const updated = this.resourcesManager.get().find((r) => r.typeName === this.resourceList.typeName)
        if (updated) {
            this.resourceList.resourceIdentifiers = updated.resourceIdentifiers
            this.nextToken = updated.nextToken
            this.updateNode()
        }
    }
}
