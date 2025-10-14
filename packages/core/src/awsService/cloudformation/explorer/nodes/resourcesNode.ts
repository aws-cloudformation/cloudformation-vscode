/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { TreeItem, TreeItemCollapsibleState } from 'vscode'
import { TreeNode } from '../../../../shared/treeview/resourceTreeDataProvider'

export class ResourcesNode implements TreeNode {
    public readonly id = 'cloudformation-resources'
    public readonly resource = undefined

    getTreeItem(): TreeItem {
        const item = new TreeItem('Resources', TreeItemCollapsibleState.Collapsed)
        item.contextValue = 'resourceSection'
        return item
    }

    getChildren(): TreeNode[] {
        // TODO: Return actual resource nodes
        return []
    }
}
