/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { v4 as uuidv4 } from 'uuid'
import { Parameter, Capability } from '@aws-sdk/client-cloudformation'
import { StackActionPhase, StackActionState, StackChange } from './stackActionRequestType'
import { LanguageClient } from 'vscode-languageclient'
import {
    showDeploymentStarted,
    showDeploymentSuccess,
    showDeploymentFailure,
    showValidationComplete,
} from '../../ui/message'
import { setContext } from '../../../../shared/vscode/setContext'
import { createDeploymentStatusBar, updateDeploymentStatus } from '../../ui/statusBar'
import { StatusBarItem, commands } from 'vscode'
import { deploy, getDeploymentStatus } from './stackActionApi'
import { createStackActionParams } from './stackActionUtil'
import { DiffWebviewProvider } from '../../ui/diffWebviewProvider'
import { getLogger } from '../../../../shared/logger/logger'

let lastDeployment: Deployment | undefined = undefined

export function getLastDeployment(): Deployment | undefined {
    return lastDeployment
}

export function setLastDeployment(deployment: Deployment | undefined): void {
    lastDeployment = deployment
}

export class Deployment {
    private readonly id: string
    private readonly uri: string
    private readonly stackName: string
    private readonly parameters?: Parameter[]
    private readonly capabilities?: Capability[]
    private readonly client: LanguageClient
    private readonly diffProvider: DiffWebviewProvider
    private status: StackActionPhase | undefined
    private changes: StackChange[] | undefined
    private statusBarItem?: StatusBarItem

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

    async deploy() {
        await deploy(
            this.client,
            createStackActionParams(this.id, this.uri, this.stackName, this.parameters, this.capabilities)
        )
        showDeploymentStarted(this.stackName)
        this.statusBarItem = createDeploymentStatusBar()
        this.pollForProgress()
    }

    getChanges(): StackChange[] | undefined {
        return this.changes
    }

    private pollForProgress() {
        const interval = setInterval(() => {
            getDeploymentStatus(this.client, { id: this.id })
                .then((deploymentResult) => {
                    if (deploymentResult.phase === this.status) {
                        return
                    }

                    this.status = deploymentResult.phase
                    this.changes = deploymentResult.changes

                    if (this.statusBarItem) {
                        updateDeploymentStatus(this.statusBarItem, deploymentResult.phase)
                    }

                    switch (deploymentResult.phase) {
                        case StackActionPhase.VALIDATION_COMPLETE:
                        case StackActionPhase.DEPLOYMENT_IN_PROGRESS:
                            showValidationComplete(this.stackName)
                            this.showDiffView()
                            // Status bar updated above, continue polling
                            break
                        case StackActionPhase.DEPLOYMENT_COMPLETE:
                            if (deploymentResult.state === StackActionState.SUCCESSFUL) {
                                showDeploymentSuccess(this.stackName)
                            } else {
                                showDeploymentFailure(this.stackName)
                            }
                            clearInterval(interval)
                            break
                        case StackActionPhase.DEPLOYMENT_FAILED:
                        case StackActionPhase.VALIDATION_FAILED:
                            showDeploymentFailure(this.stackName)
                            clearInterval(interval)
                            break
                    }
                })
                .catch((error) => {
                    getLogger().error(`Error polling for deployment status: ${error}`)
                    showDeploymentFailure(this.stackName)
                    clearInterval(interval)
                })
        }, 1000)
    }

    private showDiffView() {
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
