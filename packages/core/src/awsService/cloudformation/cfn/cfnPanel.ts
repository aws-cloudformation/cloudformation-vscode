/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { TreeDataProvider, TreeItem, EventEmitter, Event } from 'vscode'
import { SectionUI } from '../ui/sectionUI'

export class CfnPanel implements TreeDataProvider<TreeItem> {
    private readonly _onDidChangeTreeData = new EventEmitter<TreeItem | TreeItem[] | undefined | null | void>()
    readonly onDidChangeTreeData: Event<TreeItem | TreeItem[] | undefined | null | void> =
        this._onDidChangeTreeData.event

    constructor(private readonly treeDataProviders: SectionUI[]) {
        for (const tree of treeDataProviders) {
            tree.registerTreeChangedEvent(this._onDidChangeTreeData)
        }
    }

    getTreeItem(element: TreeItem): TreeItem {
        return element
    }

    getChildren(element?: TreeItem): TreeItem[] {
        return this.treeDataProviders.flatMap((provider) => {
            return provider.children(element).filter((child): child is TreeItem => {
                return child !== undefined && child !== null
            })
        })
    }
}
