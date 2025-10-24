/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { TreeItemCollapsibleState, ThemeIcon } from 'vscode'
import { AWSTreeNodeBase } from '../../../../shared/treeview/nodes/awsTreeNodeBase'
import { getLogger } from '../../../../shared/logger/logger'

export class StackOutputsNode extends AWSTreeNodeBase {
    public constructor(private readonly stackName: string) {
        super('Outputs', TreeItemCollapsibleState.None)
        this.contextValue = 'stackOutputs'
        this.iconPath = new ThemeIcon('output')
    }

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        getLogger().info(`StackOutputs getChildren: ${this.stackName}`)
        return []
    }
}
