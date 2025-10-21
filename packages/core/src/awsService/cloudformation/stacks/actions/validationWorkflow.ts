/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { StackActionPhase, StackActionState } from './stackActionRequestType'
import { showErrorMessage, showValidationStarted, showValidationSuccess, showValidationFailure } from '../../ui/message'
import { getValidationStatus, validate } from './stackActionApi'
import { createDeploymentStatusBar, updateDeploymentStatus } from '../../ui/statusBar'
import { StatusBarItem } from 'vscode'
import { createStackActionParams } from './stackActionUtil'
import { BaseStackAction } from './baseStackAction'

// TODO move this to server side, we should let server handle last validation
let lastValidation: Validation | undefined = undefined

export function getLastValidation(): Validation | undefined {
    return lastValidation
}

export function setLastValidation(validation: Validation | undefined): void {
    lastValidation = validation
}

export class Validation extends BaseStackAction {
    private status: StackActionPhase | undefined
    private statusBarItem: StatusBarItem | undefined

    async validate() {
        try {
            showValidationStarted(this.stackName)
            this.statusBarItem = createDeploymentStatusBar()
            await validate(
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
            this.pollForProgress()
        } catch (error) {
            showErrorMessage(`Error validating template: ${error instanceof Error ? error.message : String(error)}`)
        }
    }

    private pollForProgress() {
        const interval = setInterval(() => {
            getValidationStatus(this.client, { id: this.id })
                .then((validationResult) => {
                    if (validationResult.phase === this.status) {
                        return
                    }

                    this.status = validationResult.phase
                    this.changes = validationResult.changes

                    if (this.statusBarItem) {
                        updateDeploymentStatus(this.statusBarItem, validationResult.phase)
                    }

                    switch (validationResult.phase) {
                        case StackActionPhase.VALIDATION_IN_PROGRESS:
                            // Status bar updated above
                            break
                        case StackActionPhase.VALIDATION_COMPLETE:
                            if (validationResult.state === StackActionState.SUCCESSFUL) {
                                showValidationSuccess(this.stackName)

                                this.showDiffView()
                            } else {
                                showValidationFailure(this.stackName)
                            }
                            clearInterval(interval)
                            break
                        case StackActionPhase.VALIDATION_FAILED:
                            showValidationFailure(this.stackName)
                            clearInterval(interval)
                            break
                    }
                })
                .catch((error) => {
                    showErrorMessage(
                        `Error polling for validation status: ${error instanceof Error ? error.message : String(error)}`
                    )
                    clearInterval(interval)
                })
        }, 1000)
    }
}
