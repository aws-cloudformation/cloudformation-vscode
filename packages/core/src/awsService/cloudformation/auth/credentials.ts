/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Disposable } from 'vscode'
import { Auth } from '../../../auth/auth'
import { isIamConnection } from '../../../auth/connection'
import { LanguageClient } from 'vscode-languageclient'
import { CloudFormationRegionManager } from '../explorer/regionManager'

export class AwsCredentialsService implements Disposable {
    private authChangeListener: Disposable
    private client: LanguageClient | undefined

    constructor(
        private stacksManager: any,
        private resourcesManager: any,
        private regionManager: CloudFormationRegionManager
    ) {
        this.authChangeListener = Auth.instance.onDidChangeActiveConnection(() => {
            void this.updateCredentialsFromActiveConnection()
        })
    }

    async initialize(client: LanguageClient): Promise<void> {
        this.client = client
        await this.updateCredentialsFromActiveConnection()
    }

    private async updateCredentialsFromActiveConnection(): Promise<void> {
        const connection = Auth.instance.activeConnection

        if (this.client && connection && isIamConnection(connection)) {
            const credentials = await connection.getCredentials()

            await this.client.sendRequest('aws/credentials/iam/update', {
                data: {
                    profile: connection.label.replace('profile:', ''),
                    region: this.regionManager.getSelectedRegion(),
                    accessKeyId: credentials.accessKeyId,
                    secretAccessKey: credentials.secretAccessKey,
                    sessionToken: credentials.sessionToken,
                },
            })

            void this.stacksManager.reload()
            void this.resourcesManager.reload()
        }
    }

    async updateRegion(): Promise<void> {
        await this.updateCredentialsFromActiveConnection()
    }

    dispose(): void {
        this.authChangeListener.dispose()
    }
}
