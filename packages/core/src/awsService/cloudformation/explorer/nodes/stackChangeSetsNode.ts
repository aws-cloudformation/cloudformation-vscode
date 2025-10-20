/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { TreeItemCollapsibleState, ThemeIcon } from 'vscode'
import { AWSTreeNodeBase } from '../../../../shared/treeview/nodes/awsTreeNodeBase'
import { ChangeSetSummary } from '@aws-sdk/client-cloudformation'

export class StackChangeSetsNode extends AWSTreeNodeBase {
    public constructor(
        private readonly stackName: string,
        private readonly region: string
    ) {
        super('Change Sets', TreeItemCollapsibleState.Collapsed)
        this.contextValue = 'stackChangeSets'
        this.iconPath = new ThemeIcon('diff')
    }

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        // TODO: Call CloudFormation list-change-sets API with stackName and region
        return []
    }
}

export class ChangeSetNode extends AWSTreeNodeBase {
    public constructor(public readonly changeSet: ChangeSetSummary) {
        super(changeSet.ChangeSetName ?? 'Unknown Change Set', TreeItemCollapsibleState.None)
        this.contextValue = 'changeSet'
        this.tooltip = `${changeSet.ChangeSetName} [${changeSet.Status}]`
        this.iconPath = new ThemeIcon('git-commit')
    }

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        return []
    }
}
