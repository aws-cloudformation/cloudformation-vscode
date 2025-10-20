/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { TreeItemCollapsibleState, ThemeIcon } from 'vscode'
import { AWSTreeNodeBase } from '../../../../shared/treeview/nodes/awsTreeNodeBase'

export class StackResourcesNode extends AWSTreeNodeBase {
    public constructor(
        private readonly stackName: string,
        private readonly region: string
    ) {
        super('Resources', TreeItemCollapsibleState.None)
        this.contextValue = 'stackResources'
        this.iconPath = new ThemeIcon('symbol-class')
    }

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        return []
    }
}
