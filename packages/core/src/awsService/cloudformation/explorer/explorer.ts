/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { RegionProvider } from '../../../shared/regions/regionProvider'
import { AWSTreeNodeBase } from '../../../shared/treeview/nodes/awsTreeNodeBase'
import { RefreshableAwsTreeProvider } from '../../../shared/treeview/awsTreeProvider'
import { RegionNode } from './nodes/regionNode'
import { CloudFormationRegionManager } from './regionManager'
import { DocumentsNode } from './nodes/documentsNode'
import { getLogger } from '../../../shared/logger/logger'

import { StacksManager } from '../stacks/stacksManager'
import { ResourcesManager } from '../resources/resourcesManager'

import { DocumentManager } from '../documents/documentManager'

export class CloudFormationExplorer implements vscode.TreeDataProvider<AWSTreeNodeBase>, RefreshableAwsTreeProvider {
    public viewProviderId: string = 'aws.cloudformation'
    public readonly onDidChangeTreeData: vscode.Event<AWSTreeNodeBase | undefined>
    private readonly _onDidChangeTreeData: vscode.EventEmitter<AWSTreeNodeBase | undefined>
    private readonly regionManager: CloudFormationRegionManager
    private readonly documentsNode: DocumentsNode

    public constructor(
        private readonly regionProvider: RegionProvider,
        private readonly stacksManager: StacksManager,
        private readonly resourcesManager: ResourcesManager,
        documentManager: DocumentManager
    ) {
        this._onDidChangeTreeData = new vscode.EventEmitter<AWSTreeNodeBase | undefined>()
        this.onDidChangeTreeData = this._onDidChangeTreeData.event
        this.regionManager = new CloudFormationRegionManager(regionProvider)
        this.documentsNode = new DocumentsNode(documentManager)
    }

    public getTreeItem(element: AWSTreeNodeBase): vscode.TreeItem {
        return element
    }

    public async getChildren(element?: AWSTreeNodeBase): Promise<AWSTreeNodeBase[]> {
        if (!element) {
            return this.getRootChildren()
        }
        return await element.getChildren()
    }

    private getRootChildren(): AWSTreeNodeBase[] {
        try {
            const children: AWSTreeNodeBase[] = [this.documentsNode]

            let selectedRegions = this.regionManager.getSelectedRegions()

            // If no regions are selected, default to us-east-1
            if (selectedRegions.length === 0) {
                selectedRegions = ['us-east-1']
            }

            const allRegions = this.regionProvider.getRegions()

            for (const regionId of selectedRegions) {
                const region = allRegions.find((r) => r.id === regionId)
                if (region) {
                    children.push(new RegionNode(region, this.stacksManager, this.resourcesManager))
                }
            }

            return children
        } catch (error) {
            getLogger().error('CloudFormation explorer error: %O', error)
            return []
        }
    }

    public refresh(): void {
        this._onDidChangeTreeData.fire(undefined)
    }
}
