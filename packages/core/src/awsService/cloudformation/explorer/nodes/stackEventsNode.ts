/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { TreeItemCollapsibleState, ThemeIcon } from 'vscode'
import { AWSTreeNodeBase } from '../../../../shared/treeview/nodes/awsTreeNodeBase'
import { getLogger } from '../../../../shared/logger/logger'

export class StackEventsNode extends AWSTreeNodeBase {
    public constructor(private readonly stackName: string) {
        super('Events', TreeItemCollapsibleState.None)
        this.contextValue = 'stackEvents'
        this.iconPath = new ThemeIcon('history')
        getLogger().info(`StackEvents: ${stackName}`)
    }

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        getLogger().info(`StackEvents getChildren: ${this.stackName}`)
        return []
    }
}
