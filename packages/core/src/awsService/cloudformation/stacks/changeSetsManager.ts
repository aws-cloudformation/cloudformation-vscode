/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { LanguageClient } from 'vscode-languageclient'
import { ListChangeSetsRequest } from './actions/stackActionProtocol'
import { ChangeSetInfo } from './actions/stackActionRequestType'

export class ChangeSetsManager {
    constructor(private readonly client: LanguageClient) {}

    async getChangeSets(stackName: string, region: string): Promise<ChangeSetInfo[]> {
        try {
            const response = await this.client.sendRequest(ListChangeSetsRequest, {
                stackName,
            })
            return response.changeSets
        } catch (error) {
            return []
        }
    }
}
