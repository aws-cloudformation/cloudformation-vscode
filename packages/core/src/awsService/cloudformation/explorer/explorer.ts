/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { RegionProvider } from '../../../shared/regions/regionProvider'
import { AWSTreeNodeBase } from '../../../shared/treeview/nodes/awsTreeNodeBase'
import { RefreshableAwsTreeProvider } from '../../../shared/treeview/awsTreeProvider'
import { CloudFormationRegionManager } from './regionManager'
import { DocumentsNode } from './nodes/documentsNode'
import { StacksNode } from './nodes/stacksNode'
import { ResourcesNode } from './nodes/resourcesNode'
import { RegionSelectorNode } from './nodes/regionSelectorNode'
import { AwsCredentialsService } from '../auth/credentials'
import { getLogger } from '../../../shared/logger/logger'

import { StacksManager } from '../stacks/stacksManager'
import { ResourcesManager } from '../resources/resourcesManager'

import { DocumentManager } from '../documents/documentManager'
import { LanguageClient } from 'vscode-languageclient'

export class CloudFormationExplorer implements vscode.TreeDataProvider<AWSTreeNodeBase>, RefreshableAwsTreeProvider {
    public viewProviderId: string = 'aws.cloudformation'
    public readonly onDidChangeTreeData: vscode.Event<AWSTreeNodeBase | undefined>
    private readonly _onDidChangeTreeData: vscode.EventEmitter<AWSTreeNodeBase | undefined>
    public readonly regionManager: CloudFormationRegionManager
    private readonly documentsNode: DocumentsNode
    private credentialsService: AwsCredentialsService | undefined

    public constructor(
        private readonly stacksManager: StacksManager,
        private readonly resourcesManager: ResourcesManager,
        documentManager: DocumentManager,
        regionProvider: RegionProvider
    ) {
        this._onDidChangeTreeData = new vscode.EventEmitter<AWSTreeNodeBase | undefined>()
        this.onDidChangeTreeData = this._onDidChangeTreeData.event
        this.regionManager = new CloudFormationRegionManager(regionProvider)
        this.documentsNode = new DocumentsNode(documentManager)
    }

    public setCredentialsService(credentialsService: AwsCredentialsService): void {
        this.credentialsService = credentialsService
    }

    public async selectRegion(): Promise<void> {
        const changed = await this.regionManager.showRegionSelector()
        if (changed) {
            this.refresh()
            if (this.credentialsService) {
                await this.credentialsService.updateRegion()
            }
        }
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
            const children: AWSTreeNodeBase[] = [
                new RegionSelectorNode(this.regionManager),
                this.documentsNode,
                new StacksNode(this.stacksManager),
                new ResourcesNode(this.resourcesManager),
            ]

            return children
        } catch (error) {
            getLogger().error('CloudFormation explorer error: %O', error)
            return []
        }
    }

    public refresh(node?: AWSTreeNodeBase): void {
        this._onDidChangeTreeData.fire(node)
    }
}
