/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { CloudFormationExplorer } from '../explorer/explorer'

export function selectRegionCommand(explorer: CloudFormationExplorer): vscode.Disposable {
    return vscode.commands.registerCommand('aws.cloudformation.selectRegion', async () => {
        await explorer.selectRegion()
    })
}
