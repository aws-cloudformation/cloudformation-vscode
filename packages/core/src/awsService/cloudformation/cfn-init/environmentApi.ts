/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { LanguageClient } from 'vscode-languageclient'
import {
    ParsedEnvironmentFile,
    ParseEnvironmentFilesParams,
    ParseEnvironmentFilesRequest,
} from './environmentRequestType'

export async function parseEnvironmentFiles(
    client: LanguageClient,
    params: ParseEnvironmentFilesParams
): Promise<ParsedEnvironmentFile[]> {
    const result = await client.sendRequest(ParseEnvironmentFilesRequest, params)
    return result.parsedFiles
}
