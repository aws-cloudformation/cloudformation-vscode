/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { TreeItemCollapsibleState } from 'vscode'
import { AWSTreeNodeBase } from '../../../../shared/treeview/nodes/awsTreeNodeBase'
import { StackNode } from './stackNode'

import { StacksManager } from '../../stacks/stacksManager'
import { StackSummary } from '@aws-sdk/client-cloudformation'
import { ChangeSetsManager } from '../../stacks/changeSetsManager'

export class StacksNode extends AWSTreeNodeBase {
    public constructor(
        private readonly stacksManager: StacksManager,
        private readonly region: string,
        private readonly changeSetsManager: ChangeSetsManager
    ) {
        super('Stacks', TreeItemCollapsibleState.Collapsed)
        this.contextValue = 'stackSection'
    }

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        const stacks = this.stacksManager.get()
        return stacks.map((stack: StackSummary) => new StackNode(stack, this.region, this.changeSetsManager))
    }
}
