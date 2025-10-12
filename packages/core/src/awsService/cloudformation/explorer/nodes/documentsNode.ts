/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { TreeItem, TreeItemCollapsibleState } from 'vscode'
import { TreeNode } from '../../../../shared/treeview/resourceTreeDataProvider'

export class DocumentsNode implements TreeNode {
    public readonly id = 'cloudformation-documents'
    public readonly resource = undefined

    getTreeItem(): TreeItem {
        const item = new TreeItem('Documents', TreeItemCollapsibleState.Collapsed)
        item.contextValue = 'documentsSection'
        return item
    }

    getChildren(): TreeNode[] {
        // TODO: Return actual document nodes
        return []
    }
}
