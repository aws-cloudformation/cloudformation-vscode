/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { TreeItemCollapsibleState, ThemeIcon } from 'vscode'
import { AWSTreeNodeBase } from '../../../../shared/treeview/nodes/awsTreeNodeBase'
import { EnvironmentManager } from '../../cfn-init/environmentManager'
import { commandKey } from '../../utils'

export class EnvironmentsNode extends AWSTreeNodeBase {
    public constructor(readonly environmentManager: EnvironmentManager) {
        const selectedEnv = environmentManager.getSelectedEnvironmentName()
        const label = selectedEnv ? `Environment: ${selectedEnv}` : 'Environment: not selected'
        
        super(label, TreeItemCollapsibleState.None)
        this.contextValue = 'environmentsSection'
        this.iconPath = new ThemeIcon('settings-gear')
        this.tooltip = selectedEnv 
            ? `Current environment: ${selectedEnv}. Click to select a different environment.`
            : 'No environment selected. Click to select an environment.'
        this.command = {
            command: commandKey('environment.select'),
            title: 'Select Environment',
        }
    }

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        return []
    }
}
