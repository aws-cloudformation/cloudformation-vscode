/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { DevSettings } from '../../../shared/settings'
import { getServiceEnvVarConfig } from '../../../shared/vscode/env'

export interface CloudFormationLspConfig {
    manifestUrl: string
    supportedVersions: string
    id: string
    suppressPromptPrefix: string
    path?: string
    environment?: string
}

export const defaultCloudFormationLspConfig: CloudFormationLspConfig = {
    manifestUrl: 'https://d2485r7obgomg5.cloudfront.net/manifest.json',
    supportedVersions: '0.*.*',
    id: 'CloudFormation',
    suppressPromptPrefix: 'cloudformation',
    path: undefined,
    environment: 'alpha',
}

export function getCloudFormationLspConfig(): CloudFormationLspConfig {
    return {
        ...defaultCloudFormationLspConfig,
        ...(DevSettings.instance.getServiceConfig('cloudformationLsp', {}) as CloudFormationLspConfig),
        ...getServiceEnvVarConfig('cloudformationLsp', Object.keys(defaultCloudFormationLspConfig)),
    }
}
