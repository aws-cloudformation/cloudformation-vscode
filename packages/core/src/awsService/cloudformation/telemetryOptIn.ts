/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExtensionContext, window } from 'vscode'
import { CloudFormationTelemetrySettings } from './extensionConfig'

/* eslint-disable aws-toolkits/no-banned-usages */
export async function promptTelemetryOptIn(
    context: ExtensionContext,
    cfnTelemetrySettings: CloudFormationTelemetrySettings
): Promise<boolean> {
    const telemetryEnabled = cfnTelemetrySettings.get('enabled', false)
    const hasResponded = context.globalState.get<boolean>('aws.cloudformation.telemetry.hasResponded', false)
    const lastPromptDate = context.globalState.get<number>('aws.cloudformation.telemetry.lastPromptDate', 0)
    const now = Date.now()
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000

    // If user has permanently responded, use their choice
    if (hasResponded) {
        return telemetryEnabled
    }

    // Check if we should show reminder (30 days since last prompt)
    const shouldPrompt = lastPromptDate === 0 || now - lastPromptDate >= thirtyDaysMs
    if (!shouldPrompt) {
        return telemetryEnabled
    }

    const message =
        'Help improve the AWS CloudFormation Language Server by sharing anonymous usage data with AWS. You can change this preference at any time in Settings.'

    const response = await window.showInformationMessage(message, 'Allow', 'Deny', 'Not Now')

    if (response === 'Allow') {
        await cfnTelemetrySettings.update('enabled', true)
        await context.globalState.update('aws.cloudformation.telemetry.hasResponded', true)
        return true
    } else if (response === 'Deny') {
        await cfnTelemetrySettings.update('enabled', false)
        await context.globalState.update('aws.cloudformation.telemetry.hasResponded', true)
        return false
    } else if (response === 'Not Now') {
        await cfnTelemetrySettings.update('enabled', false)
        await context.globalState.update('aws.cloudformation.telemetry.lastPromptDate', now)
        void window.showInformationMessage(
            'You can change your telemetry preference at any time in Settings > AWS CloudFormation > Telemetry'
        )
        return false
    }

    // User dismissed the prompt - treat as "Not Now"
    await context.globalState.update('aws.cloudformation.telemetry.lastPromptDate', now)
    return false
}
