/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { RequestType } from 'vscode-languageserver-protocol'
import { DeploymentConfig } from './cfnProjectTypes'

export type DocumentInfo = {
    type: 'JSON' | 'YAML'
    content: string
    fileName: string
}

export type ParsedEnvironmentFile = {
    deploymentConfig: DeploymentConfig
    fileName: string
}

export type ParseEnvironmentFilesParams = {
    documents: DocumentInfo[]
}

export type ParseEnvironmentFilesResult = {
    parsedFiles: ParsedEnvironmentFile[]
}

export const ParseEnvironmentFilesRequest = new RequestType<
    ParseEnvironmentFilesParams,
    ParseEnvironmentFilesResult,
    void
>('aws/cfn/environment/files/parse')
