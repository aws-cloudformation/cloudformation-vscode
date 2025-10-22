/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { TreeItemCollapsibleState } from 'vscode'
import * as vscode from 'vscode'
import { AWSTreeNodeBase } from '../../../../shared/treeview/nodes/awsTreeNodeBase'
import { CloudFormationRegionManager } from '../regionManager'
import { RegionSelectorContextValue } from '../contextValue'

export class RegionSelectorNode extends AWSTreeNodeBase {
    public constructor(regionManager: CloudFormationRegionManager) {
        const currentRegion = regionManager.getSelectedRegion()
        super(currentRegion, TreeItemCollapsibleState.None)
        this.contextValue = RegionSelectorContextValue
        this.iconPath = new vscode.ThemeIcon('globe')
        this.tooltip = `Current region: ${currentRegion}. Click to select a different region.`
        this.command = {
            command: 'aws.cloudformation.selectRegion',
            title: 'Select Region',
        }
    }

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        return []
    }
}
