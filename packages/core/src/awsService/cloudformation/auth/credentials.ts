/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Disposable } from 'vscode'
import { Auth } from '../../../auth/auth'
import { isIamConnection } from '../../../auth/connection'
import { LanguageClient } from 'vscode-languageclient'

export class AwsCredentialsService implements Disposable {
    private authChangeListener: Disposable

    constructor(
        private stacksManager: any,
        private resourcesManager: any
    ) {
        // Listen for AWS Toolkit auth changes
        this.authChangeListener = Auth.instance.onDidChangeActiveConnection(() => {
            void this.updateCredentialsFromActiveConnection()
        })
    }

    async initialize(client: LanguageClient): Promise<void> {
        await this.updateCredentialsFromActiveConnection()
        // Send credentials to CloudFormation Language Server
        const connection = Auth.instance.activeConnection
        if (connection && isIamConnection(connection)) {
            await client.sendRequest('aws/credentials/iam/update', {
                profileName: connection.label.replace('profile:', ''),
                region: 'us-east-1', // TODO: Get actual region from settings or connection
            })
        }
    }

    private async updateCredentialsFromActiveConnection(): Promise<void> {
        const connection = Auth.instance.activeConnection
        if (connection && isIamConnection(connection)) {
            // Reload CloudFormation data when auth changes
            void this.stacksManager.reload()
            void this.resourcesManager.reload()
        }
    }

    dispose(): void {
        this.authChangeListener.dispose()
    }
}
