/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { RequestType } from 'vscode-languageserver-protocol'
import { LanguageClient } from 'vscode-languageclient'

interface ChangeSetInfo {
    changeSetName: string
    status: string
    creationTime?: string
    description?: string
}

type ListChangeSetsParams = {
    stackName: string
    region: string
}

type ListChangeSetsResult = {
    changeSets: ChangeSetInfo[]
}

const ListChangeSetsRequest = new RequestType<ListChangeSetsParams, ListChangeSetsResult, void>('aws/cfn/changeSets')

export class ChangeSetsManager {
    constructor(private readonly client: LanguageClient) {}

    async getChangeSets(stackName: string, region: string): Promise<ChangeSetInfo[]> {
        try {
            const response = await this.client.sendRequest(ListChangeSetsRequest, {
                stackName,
                region,
            })
            return response.changeSets
        } catch (error) {
            return []
        }
    }
}

export type { ChangeSetInfo }
