/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { TreeItemCollapsibleState, ThemeIcon, ThemeColor } from 'vscode'
import { AWSTreeNodeBase } from '../../../../shared/treeview/nodes/awsTreeNodeBase'
import { ChangeSetsManager } from '../../stacks/changeSetsManager'
import { ChangeSetInfo } from '../../stacks/actions/stackActionRequestType'

export class StackChangeSetsNode extends AWSTreeNodeBase {
    public constructor(
        private readonly stackName: string,
        private readonly changeSetsManager: ChangeSetsManager
    ) {
        super('Change Sets', TreeItemCollapsibleState.Collapsed)
        this.contextValue = 'stackChangeSets'
        this.iconPath = new ThemeIcon('diff')
    }

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        const changeSets = await this.changeSetsManager.getChangeSets(this.stackName)
        return changeSets.map((changeSet) => new ChangeSetNode(changeSet))
    }
}

export class ChangeSetNode extends AWSTreeNodeBase {
    public constructor(public readonly changeSet: ChangeSetInfo) {
        super(changeSet.changeSetName, TreeItemCollapsibleState.None)
        this.contextValue = 'changeSet'
        this.tooltip = `${changeSet.changeSetName} [${changeSet.status}]`
        this.iconPath = this.getIconForStatus(changeSet.status)
    }

    private getIconForStatus(status: string): ThemeIcon {
        switch (status) {
            case 'CREATE_PENDING':
            case 'DELETE_PENDING':
                return new ThemeIcon('clock')
            case 'CREATE_IN_PROGRESS':
            case 'DELETE_IN_PROGRESS':
                return new ThemeIcon('sync~spin', new ThemeColor('charts.yellow'))
            case 'CREATE_COMPLETE':
                return new ThemeIcon('check', new ThemeColor('charts.green'))
            case 'DELETE_COMPLETE':
                return new ThemeIcon('trash')
            case 'DELETE_FAILED':
            case 'FAILED':
                return new ThemeIcon('error', new ThemeColor('charts.red'))
            default:
                return new ThemeIcon('git-commit')
        }
    }

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        return []
    }
}
