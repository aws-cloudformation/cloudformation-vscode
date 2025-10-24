/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { TreeItem, TreeItemCollapsibleState, EventEmitter } from 'vscode'
import { SectionUI } from '../ui/sectionUI'
import { EnvironmentManager } from './environmentManager'
import { EnvironmentNode } from '../explorer/nodes/environmentNode'
import { commandKey } from '../utils'

const EnvironmentSectionContextValue = 'environmentSection'

export class EnvironmentSectionUI implements SectionUI<EnvironmentNode> {
    private treeDataChanged?: EventEmitter<TreeItem | TreeItem[] | undefined | null | void>

    public base = new EnvironmentNode(
        'Environment: not selected',
        TreeItemCollapsibleState.None,
        EnvironmentSectionContextValue,
        undefined,
        undefined,
        {
            command: commandKey('environment.select'),
            title: 'Select Environment',
        }
    )

    constructor(private readonly environmentManager: EnvironmentManager) {}

    registerTreeChangedEvent(treeDataChanged: EventEmitter<TreeItem | TreeItem[] | undefined | null | void>) {
        this.treeDataChanged = treeDataChanged
    }

    onChange() {
        return () => {
            this.refreshUI()
        }
    }

    private refreshUI() {
        const selectedEnv = this.environmentManager.getSelectedEnvironmentName()
        this.base.label = selectedEnv ? `Environment: ${selectedEnv}` : 'Environment: not selected'
        this.treeDataChanged?.fire()
    }

    children(element?: EnvironmentNode): EnvironmentNode[] {
        if (!element) {
            return [this.base]
        }
        return []
    }
}
