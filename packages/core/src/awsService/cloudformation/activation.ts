/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExtensionContext, commands, window } from 'vscode'
import { ResourceTreeDataProvider } from '../../shared/treeview/resourceTreeDataProvider'
import { CloudFormationRootNode } from './explorer/rootNode'
import { activate as activateCloudFormation } from './extension'

/**
 * Activates CloudFormation components.
 */
export async function activate(context: ExtensionContext): Promise<void> {
    // Create the CloudFormation tree view
    const rootNode = CloudFormationRootNode.instance
    const treeDataProvider = new ResourceTreeDataProvider({ getChildren: () => rootNode.getChildren() })

    // Connect section node changes to trigger root node refresh
    const refreshTree = () => {
        rootNode.refresh()
        treeDataProvider.refresh()
    }

    rootNode.documentsNode.onDidChangeChildren?.(refreshTree)
    rootNode.stacksNode.onDidChangeChildren?.(refreshTree)
    rootNode.resourcesNode.onDidChangeChildren?.(refreshTree)

    // Register the tree view
    const treeView = window.createTreeView('aws.cloudformation', {
        treeDataProvider,
        showCollapseAll: true,
    })

    context.subscriptions.push(
        treeView,
        commands.registerCommand('aws.cloudformation.refresh', () => {
            treeDataProvider.refresh()
        })
    )

    // Activate the rest of CloudFormation functionality
    await activateCloudFormation(context)
}
