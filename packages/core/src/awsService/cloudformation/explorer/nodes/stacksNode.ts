/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { TreeItem, TreeItemCollapsibleState } from 'vscode'
import { TreeNode } from '../../../../shared/treeview/resourceTreeDataProvider'

export class StacksNode implements TreeNode {
    public readonly id = 'cloudformation-stacks'
    public readonly resource = undefined

    getTreeItem(): TreeItem {
        const item = new TreeItem('Stacks', TreeItemCollapsibleState.Collapsed)
        item.contextValue = 'stacksSection'
        return item
    }

    getChildren(): TreeNode[] {
        // TODO: Return actual stack nodes
        return []
    }
}
