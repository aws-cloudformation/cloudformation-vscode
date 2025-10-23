/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Disposable } from 'vscode'
import { LanguageClient } from 'vscode-languageclient'
import { CloudFormationRegionManager } from '../explorer/regionManager'
import globals from '../../../shared/extensionGlobals'

export class AwsCredentialsService implements Disposable {
    private authChangeListener: Disposable
    private client: LanguageClient | undefined

    constructor(
        private stacksManager: any,
        private resourcesManager: any,
        private regionManager: CloudFormationRegionManager
    ) {
        this.authChangeListener = globals.awsContext.onDidChangeContext(() => {
            void this.updateCredentialsFromActiveConnection()
        })
    }

    async initialize(client: LanguageClient): Promise<void> {
        this.client = client
        await this.updateCredentialsFromActiveConnection()
    }

    private async updateCredentialsFromActiveConnection(): Promise<void> {
        if (!this.client) {
            return
        }

        const credentials = await globals.awsContext.getCredentials()
        const profileName = globals.awsContext.getCredentialProfileName()

        if (credentials && profileName) {
            await this.client.sendRequest('aws/credentials/iam/update', {
                data: {
                    profile: profileName,
                    region: this.regionManager.getSelectedRegion(),
                    accessKeyId: credentials.accessKeyId,
                    secretAccessKey: credentials.secretAccessKey,
                    sessionToken: credentials.sessionToken,
                },
            })
        }

        void this.stacksManager.reload()
        void this.resourcesManager.reload()
    }

    async updateRegion(): Promise<void> {
        await this.updateCredentialsFromActiveConnection()
    }

    dispose(): void {
        this.authChangeListener.dispose()
    }
}
