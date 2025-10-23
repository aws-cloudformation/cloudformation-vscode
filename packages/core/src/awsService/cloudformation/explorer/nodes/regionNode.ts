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
import { ChangeSetsManager } from '../../stacks/changeSetsManager'
import { LanguageClient } from 'vscode-languageclient'

export class RegionNode extends AWSTreeNodeBase {
    private readonly stacksSection: StacksNode
    private readonly resourcesSection: ResourcesNode

    public constructor(
        public readonly region: Region,
        stacksManager: StacksManager,
        resourcesManager: ResourcesManager,
        client: LanguageClient
    ) {
        super(region.name, TreeItemCollapsibleState.Collapsed)
        this.contextValue = 'region'
        this.description = region.id
        const changeSetsManager = new ChangeSetsManager(client)
        this.stacksSection = new StacksNode(stacksManager, region.id, changeSetsManager)
        this.resourcesSection = new ResourcesNode(resourcesManager)
    }

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        return [this.stacksSection, this.resourcesSection]
    }
}
