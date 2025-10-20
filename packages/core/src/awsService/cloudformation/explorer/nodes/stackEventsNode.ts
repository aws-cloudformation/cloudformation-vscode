/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { TreeItemCollapsibleState, ThemeIcon } from 'vscode'
import { AWSTreeNodeBase } from '../../../../shared/treeview/nodes/awsTreeNodeBase'

export class StackEventsNode extends AWSTreeNodeBase {
    public constructor(
        private readonly stackName: string,
        private readonly region: string
    ) {
        super('Events', TreeItemCollapsibleState.None)
        this.contextValue = 'stackEvents'
        this.iconPath = new ThemeIcon('history')
    }

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        return []
    }
}
