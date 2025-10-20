/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Parameter, Capability } from '@aws-sdk/client-cloudformation'
import { StackActionPhase, StackActionState, ResourceToImport } from './stackActionRequestType'
import { LanguageClient } from 'vscode-languageclient'
import {
    showDeploymentStarted,
    showDeploymentSuccess,
    showDeploymentFailure,
    showValidationComplete,
} from '../../ui/message'
import { createDeploymentStatusBar, updateDeploymentStatus } from '../../ui/statusBar'
import { StatusBarItem } from 'vscode'
import { deploy, getDeploymentStatus } from './stackActionApi'
import { createStackActionParams } from './stackActionUtil'
import { DiffWebviewProvider } from '../../ui/diffWebviewProvider'
import { BaseStackAction } from './baseStackAction'
import { getLogger } from '../../../../shared/logger/logger'

let lastDeployment: Deployment | undefined = undefined

export function getLastDeployment(): Deployment | undefined {
    return lastDeployment
}

export function setLastDeployment(deployment: Deployment | undefined): void {
    lastDeployment = deployment
}

export class Deployment extends BaseStackAction {
    private status: StackActionPhase | undefined
    private statusBarItem?: StatusBarItem

    constructor(
        uri: string,
        stackName: string,
        client: LanguageClient,
        diffProvider: DiffWebviewProvider,
        parameters?: Parameter[],
        capabilities?: Capability[],
        resourcesToImport?: ResourceToImport[]
    ) {
        super(uri, stackName, client, diffProvider, parameters, capabilities, resourcesToImport)
    }

    async deploy() {
        await deploy(
            this.client,
            createStackActionParams(
                this.id,
                this.uri,
                this.stackName,
                this.parameters,
                this.capabilities,
                this.resourcesToImport
            )
        )
        showDeploymentStarted(this.stackName)
        this.statusBarItem = createDeploymentStatusBar()
        this.pollForProgress()
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
}
