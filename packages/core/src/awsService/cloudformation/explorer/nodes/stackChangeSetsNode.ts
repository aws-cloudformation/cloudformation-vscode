/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { TreeItemCollapsibleState, ThemeIcon } from 'vscode'
import { AWSTreeNodeBase } from '../../../../shared/treeview/nodes/awsTreeNodeBase'
import { ChangeSetsManager, ChangeSetInfo } from '../../stacks/changeSetsManager'

export class StackChangeSetsNode extends AWSTreeNodeBase {
    public constructor(
        private readonly stackName: string,
        private readonly region: string,
        private readonly changeSetsManager: ChangeSetsManager
    ) {
        super('Change Sets', TreeItemCollapsibleState.Collapsed)
        this.contextValue = 'stackChangeSets'
        this.iconPath = new ThemeIcon('diff')
    }

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        const changeSets = await this.changeSetsManager.getChangeSets(this.stackName, this.region)
        return changeSets.map((changeSet) => new ChangeSetNode(changeSet))
    }
}

export class ChangeSetNode extends AWSTreeNodeBase {
    public constructor(public readonly changeSet: ChangeSetInfo) {
        super(changeSet.changeSetName, TreeItemCollapsibleState.None)
        this.contextValue = 'changeSet'
        this.tooltip = `${changeSet.changeSetName} [${changeSet.status}]`
        this.iconPath = new ThemeIcon('git-commit')
    }

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        return []
    }
}
