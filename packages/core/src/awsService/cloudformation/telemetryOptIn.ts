/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExtensionContext, env, Uri, window } from 'vscode'
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

    const message = 'Enable telemetry for AWS CloudFormation Language Server?'
    const detail =
        'Help improve the language server by sharing anonymous usage data with AWS. You can change this preference at any time in Settings.'

    const learnMore = 'Learn More'
    const response = await window.showInformationMessage(
        message,
        { modal: true, detail },
        'Allow',
        'Not Now',
        'Never',
        learnMore
    )

    if (response === learnMore) {
        await env.openExternal(
            Uri.parse('https://github.com/aws-cloudformation/cloudformation-languageserver/tree/main/src/telemetry')
        )
        return promptTelemetryOptIn(context, cfnTelemetrySettings)
    }

    if (response === 'Allow') {
        await cfnTelemetrySettings.update('enabled', true)
        await context.globalState.update('aws.cloudformation.telemetry.hasResponded', true)
        return true
    } else if (response === 'Never') {
        await cfnTelemetrySettings.update('enabled', false)
        await context.globalState.update('aws.cloudformation.telemetry.hasResponded', true)
        return false
    } else if (response === 'Not Now') {
        await cfnTelemetrySettings.update('enabled', false)
        await context.globalState.update('aws.cloudformation.telemetry.lastPromptDate', now)
        return false
    }

    // User dismissed the prompt - treat as "Not Now"
    await context.globalState.update('aws.cloudformation.telemetry.lastPromptDate', now)
    return false
}
