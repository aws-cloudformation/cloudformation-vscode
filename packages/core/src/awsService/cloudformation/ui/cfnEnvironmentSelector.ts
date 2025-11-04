/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { window } from 'vscode'
import { CfnEnvironmentConfig, CfnEnvironmentLookup } from '../cfn-init/cfnProjectTypes'
import { formatMessage } from '../utils'

export class CfnEnvironmentSelector {
    public async selectEnvironment(environmentLookup: CfnEnvironmentLookup): Promise<string | undefined> {
        if (Object.keys(environmentLookup).length === 0) {
            void window.showWarningMessage(formatMessage('No environments found. Initialize a CFN project first.'))
            return
        }

        const items = [
            { label: 'None', description: 'No environment selected' },
            ...Object.values(environmentLookup).map((env: CfnEnvironmentConfig) => ({
                label: env.name,
                description: `AWS Profile: ${env.profile}`,
            })),
        ]

        const selected = await window.showQuickPick(items, {
            placeHolder: 'Select an environment',
        })

        return selected?.label === 'None' ? undefined : selected?.label
    }
}
