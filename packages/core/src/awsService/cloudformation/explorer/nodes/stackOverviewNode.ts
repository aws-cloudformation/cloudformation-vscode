/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { TreeItemCollapsibleState, ThemeIcon } from 'vscode'
import { AWSTreeNodeBase } from '../../../../shared/treeview/nodes/awsTreeNodeBase'

export class StackOverviewNode extends AWSTreeNodeBase {
    public constructor(
        private readonly stackName: string,
        private readonly region: string
    ) {
        super('Overview', TreeItemCollapsibleState.None)
        this.contextValue = 'stackOverview'
        this.iconPath = new ThemeIcon('info')
    }

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        return []
    }
}
