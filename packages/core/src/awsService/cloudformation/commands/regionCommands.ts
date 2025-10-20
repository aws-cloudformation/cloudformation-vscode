/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { CloudFormationRegionManager } from '../explorer/regionManager'
import globals from '../../../shared/extensionGlobals'

import { CloudFormationExplorer } from '../explorer/explorer'

export function showRegionsCommand(explorer: CloudFormationExplorer): vscode.Disposable {
    return vscode.commands.registerCommand('aws.cloudformation.showRegions', async () => {
        const regionManager = new CloudFormationRegionManager(globals.regionProvider)
        const changed = await regionManager.showRegionSelector()

        if (changed) {
            explorer.refresh()
        }
    })
}
