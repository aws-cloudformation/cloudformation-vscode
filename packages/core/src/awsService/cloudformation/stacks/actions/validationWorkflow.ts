/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { v4 as uuidv4 } from 'uuid'
import { Parameter, Capability } from '@aws-sdk/client-cloudformation'
import {
    StackActionPhase,
    StackChange,
    StackActionState,
    ResourceToImport,
    ChangeSetOptionalFlags,
    ValidationDetail,
} from './stackActionRequestType'
import { LanguageClient } from 'vscode-languageclient/node'
import { showErrorMessage, showValidationStarted, showValidationSuccess, showValidationFailure } from '../../ui/message'
import { describeValidationStatus, getValidationStatus, validate } from './stackActionApi'
import { createDeploymentStatusBar, updateWorkflowStatus } from '../../ui/statusBar'
import { StatusBarItem, commands } from 'vscode'
import { DiffWebviewProvider } from '../../ui/diffWebviewProvider'
import { createValidationParams } from './stackActionUtil'
import { extractErrorMessage } from '../../utils'
import { getLogger } from '../../../../shared/logger/logger'
import { commandKey } from '../../utils'

// TODO move this to server side, we should let server handle last validation
let lastValidation: Validation | undefined = undefined

export function getLastValidation(): Validation | undefined {
    return lastValidation
}

export function setLastValidation(validation: Validation | undefined): void {
    lastValidation = validation
}

export class Validation {
    private readonly id: string
    private status: StackActionPhase | undefined
    private changes: StackChange[] | undefined
    private statusBarItem: StatusBarItem | undefined
    private changeSetName?: string

    constructor(
        public readonly uri: string,
        public readonly stackName: string,
        private readonly client: LanguageClient,
        private readonly diffProvider: DiffWebviewProvider,
        public readonly parameters?: Parameter[],
        private readonly capabilities?: Capability[],
        private readonly resourcesToImport?: ResourceToImport[],
        private readonly shouldEnableDeployment: boolean = false,
        private readonly optionalFlags?: ChangeSetOptionalFlags,
        private readonly s3Bucket?: string,
        private readonly s3Key?: string
    ) {
        this.id = uuidv4()
    }

    async validate() {
        try {
            showValidationStarted(this.stackName)
            this.statusBarItem = createDeploymentStatusBar()
            // Capture the result to get changeSetName
            const result = await validate(
                this.client,
                createValidationParams(
                    this.id,
                    this.uri,
                    this.stackName,
                    this.parameters,
                    this.capabilities,
                    this.resourcesToImport,
                    this.shouldEnableDeployment,
                    this.optionalFlags,
                    this.s3Bucket,
                    this.s3Key
                )
            )

            void commands.executeCommand(commandKey('stacks.refresh'))
            this.changeSetName = result.changeSetName

            this.pollForProgress()
        } catch (error) {
            showErrorMessage(`Error validating template: ${error instanceof Error ? error.message : String(error)}`)
        }
    }

    private pollForProgress() {
        const interval = setInterval(() => {
            getValidationStatus(this.client, { id: this.id })
                .then(async (validationResult) => {
                    if (validationResult.phase === this.status) {
                        return
                    }

                    this.status = validationResult.phase
                    this.changes = validationResult.changes

                    if (this.statusBarItem) {
                        updateWorkflowStatus(this.statusBarItem, validationResult.phase)
                    }

                    switch (validationResult.phase) {
                        case StackActionPhase.VALIDATION_IN_PROGRESS:
                            // Status bar updated above
                            break
                        case StackActionPhase.VALIDATION_COMPLETE: {
                            const describeValidationStatusResult = await describeValidationStatus(this.client, {
                                id: this.id,
                            })
                            if (validationResult.state === StackActionState.SUCCESSFUL) {
                                showValidationSuccess(this.stackName)

                                this.showDiffView(describeValidationStatusResult.ValidationDetails ?? [])
                            } else {
                                showValidationFailure(
                                    this.stackName,
                                    describeValidationStatusResult.FailureReason ?? 'UNKNOWN'
                                )
                            }
                            void commands.executeCommand(commandKey('stacks.refresh'))
                            clearInterval(interval)
                            break
                        }
                        case StackActionPhase.VALIDATION_FAILED: {
                            const describeValidationStatusResult = await describeValidationStatus(this.client, {
                                id: this.id,
                            })
                            showValidationFailure(
                                this.stackName,
                                describeValidationStatusResult.FailureReason ?? 'UNKNOWN'
                            )
                            void commands.executeCommand('workbench.panel.markers.view.focus')
                            void commands.executeCommand(commandKey('stacks.refresh'))
                            clearInterval(interval)
                            break
                        }
                    }
                })
                .catch((error) => {
                    getLogger().error(`Error polling for deployment status: ${error}`)
                    showErrorMessage(`Error polling for validation status: ${extractErrorMessage(error)}`)
                    void commands.executeCommand(commandKey('stacks.refresh'))
                    clearInterval(interval)
                })
        }, 1000)
    }

    private showDiffView(validationDetail?: ValidationDetail[]) {
        void this.diffProvider.updateData(
            this.stackName,
            this.changes,
            this.changeSetName,
            this.shouldEnableDeployment,
            validationDetail
        )
        void commands.executeCommand(commandKey('diff.focus'))
    }
}
