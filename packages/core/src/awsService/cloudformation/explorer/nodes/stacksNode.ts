/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { TreeItemCollapsibleState } from 'vscode'
import { AWSTreeNodeBase } from '../../../../shared/treeview/nodes/awsTreeNodeBase'
import { StackNode } from './stackNode'
import { commandKey } from '../../utils'
import { StacksManager } from '../../stacks/stacksManager'
import { StackSummary } from '@aws-sdk/client-cloudformation'

class LoadMoreStacksNode extends AWSTreeNodeBase {
    public constructor(private readonly parent: StacksNode) {
        super('[Load More...]', TreeItemCollapsibleState.None)
        this.contextValue = 'loadMoreStacks'
        this.command = {
            title: 'Load More',
            command: commandKey('api.loadMoreStacks'),
            arguments: [this.parent],
        }
    }
}

export class StacksNode extends AWSTreeNodeBase {
    private readonly pageSize = 50
    private currentIndex = 0
    private loadedChildren: StackNode[] = []

    public constructor(private readonly stacksManager: StacksManager) {
        super('Stacks', TreeItemCollapsibleState.Collapsed)
        this.contextValue = 'stackSection'
    }

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        const stacks = this.stacksManager.get()

        if (this.loadedChildren.length === 0 || this.currentIndex === 0) {
            this.loadedChildren = []
            this.currentIndex = 0
            this.loadMoreStacks(stacks)
        }

        const hasMore = this.currentIndex < stacks.length
        return hasMore ? [...this.loadedChildren, new LoadMoreStacksNode(this)] : this.loadedChildren
    }

    public loadMoreStacks(allStacks?: StackSummary[]): void {
        const stacks = allStacks ?? this.stacksManager.get()
        const endIndex = Math.min(this.currentIndex + this.pageSize, stacks.length)
        const pageStacks = stacks.slice(this.currentIndex, endIndex)

        const newNodes = pageStacks.map((stack: StackSummary) => new StackNode(stack))

        this.loadedChildren.push(...newNodes)
        this.currentIndex = endIndex
    }
}
