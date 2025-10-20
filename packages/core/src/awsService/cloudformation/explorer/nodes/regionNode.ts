/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { TreeItemCollapsibleState } from 'vscode'
import { AWSTreeNodeBase } from '../../../../shared/treeview/nodes/awsTreeNodeBase'
import { Region } from '../../../../shared/regions/endpoints'
import { StacksManager } from '../../stacks/stacksManager'
import { ResourcesManager } from '../../resources/resourcesManager'
import { StacksNode } from './stacksNode'
import { ResourcesNode } from './resourcesNode'

export class RegionNode extends AWSTreeNodeBase {
    private readonly stacksSection: StacksNode
    private readonly resourcesSection: ResourcesNode

    public constructor(
        public readonly region: Region,
        stacksManager: StacksManager,
        resourcesManager: ResourcesManager
    ) {
        super(region.name, TreeItemCollapsibleState.Collapsed)
        this.contextValue = 'region'
        this.description = region.id
        this.stacksSection = new StacksNode(stacksManager)
        this.resourcesSection = new ResourcesNode(resourcesManager)
    }

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        return [this.stacksSection, this.resourcesSection]
    }
}
