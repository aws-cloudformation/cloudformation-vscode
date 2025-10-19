/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { v4 as uuidv4 } from 'uuid'
import { Parameter, Capability } from '@aws-sdk/client-cloudformation'
import { StackChange } from './stackActionRequestType'
import { LanguageClient } from 'vscode-languageclient'
import { setContext } from '../../../../shared/vscode/setContext'
import { commands } from 'vscode'
import { DiffWebviewProvider } from '../../ui/diffWebviewProvider'

export abstract class BaseStackAction {
    protected id: string
    public readonly uri: string
    public readonly stackName: string
    public readonly parameters?: Parameter[]
    protected capabilities?: Capability[]
    protected client: LanguageClient
    protected diffProvider: DiffWebviewProvider
    protected changes: StackChange[] | undefined

    constructor(
        uri: string,
        stackName: string,
        client: LanguageClient,
        diffProvider: DiffWebviewProvider,
        parameters?: Parameter[],
        capabilities?: Capability[]
    ) {
        this.id = uuidv4()
        this.uri = uri
        this.stackName = stackName
        this.client = client
        this.diffProvider = diffProvider
        this.parameters = parameters
        this.capabilities = capabilities
    }

    getChanges(): StackChange[] | undefined {
        return this.changes
    }

    protected showDiffView() {
        void setContext('aws.cloudformation.stacks.diffVisible', true)
        this.diffProvider.updateData(this.stackName, this.changes)
        void commands.executeCommand('aws.cloudformation.diff.focus')
    }

    // Test-specific accessors - protected to limit access
    protected getDiffProvider(): DiffWebviewProvider {
        return this.diffProvider
    }

    protected setChanges(changes: StackChange[]): void {
        this.changes = changes
    }

    protected showDiffViewForTest(): void {
        this.showDiffView()
    }
}
