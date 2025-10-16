/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { TreeNode } from '../../../shared/treeview/resourceTreeDataProvider'
import { DocumentsNode } from './nodes/documentsNode'
import { StacksNode } from './nodes/stacksNode'
import { ResourcesNode } from './nodes/resourcesNode'

export class CloudFormationRootNode {
    private static _instance: CloudFormationRootNode
    private _documentsNode: DocumentsNode
    private _stacksNode: StacksNode
    private _resourcesNode: ResourcesNode

    private constructor() {
        this._documentsNode = new DocumentsNode()
        this._stacksNode = new StacksNode()
        this._resourcesNode = new ResourcesNode()
    }

    public static get instance(): CloudFormationRootNode {
        if (!CloudFormationRootNode._instance) {
            CloudFormationRootNode._instance = new CloudFormationRootNode()
        }
        return CloudFormationRootNode._instance
    }

    public get documentsNode(): TreeNode {
        return this._documentsNode
    }

    public get stacksNode(): TreeNode {
        return this._stacksNode
    }

    public get resourcesNode(): TreeNode {
        return this._resourcesNode
    }

    public getChildren(): TreeNode[] {
        return [this.documentsNode, this.stacksNode, this.resourcesNode]
    }

    public refresh(): void {
        // Refresh logic
    }
}
