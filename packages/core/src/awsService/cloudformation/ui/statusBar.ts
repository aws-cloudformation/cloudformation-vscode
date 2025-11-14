/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { window, StatusBarAlignment, StatusBarItem, ThemeColor, QuickPickItem, commands } from 'vscode'
import { StackActionPhase } from '../stacks/actions/stackActionRequestType'
import { commandKey } from '../utils'

interface OperationInfo {
    stackName: string
    type: 'Validation' | 'Deployment'
    changeSetName?: string
    startTime: Date
    phase: StackActionPhase
}

interface StatusBarHandle {
    update(phase: StackActionPhase): void
    release(): void
}

class SharedStatusBar {
    private statusBarItem?: StatusBarItem
    private refCount = 0
    private activeCount = 0
    private completedCount = 0
    private failedCount = 0
    private disposeTimer?: NodeJS.Timeout
    private operations: Map<number, OperationInfo> = new Map()
    private nextId = 0

    acquire(stackName: string, type: 'Validation' | 'Deployment', changeSetName?: string): StatusBarHandle {
        if (this.disposeTimer) {
            clearTimeout(this.disposeTimer)
            this.disposeTimer = undefined
            this.activeCount = 0
            this.completedCount = 0
            this.failedCount = 0
        }

        if (!this.statusBarItem) {
            this.statusBarItem = window.createStatusBarItem(StatusBarAlignment.Left, 100)
            this.statusBarItem.command = commandKey('showOperationStatus')
            this.statusBarItem.show()
        }

        this.refCount++
        this.activeCount++

        const id = this.nextId++
        this.operations.set(id, {
            stackName,
            type,
            changeSetName,
            startTime: new Date(),
            phase: StackActionPhase.VALIDATION_IN_PROGRESS,
        })

        this.updateDisplay()

        return {
            update: (phase: StackActionPhase) => this.updatePhase(id, phase),
            release: () => this.release(id),
        }
    }

    private updatePhase(id: number, phase: StackActionPhase): void {
        const operation = this.operations.get(id)
        if (operation) {
            operation.phase = phase
        }

        if (isTerminalPhase(phase)) {
            this.activeCount--
            if (isFailurePhase(phase)) {
                this.failedCount++
            } else {
                this.completedCount++
            }
        }
        this.updateDisplay()
    }

    private updateDisplay(): void {
        if (!this.statusBarItem) {
            return
        }

        const total = this.activeCount + this.completedCount + this.failedCount

        if (this.activeCount > 0) {
            this.statusBarItem.text = `$(sync~spin) AWS CloudFormation (${total})`
            this.statusBarItem.backgroundColor = undefined
        } else if (this.failedCount > 0) {
            this.statusBarItem.text = `$(error) AWS CloudFormation (${total})`
            this.statusBarItem.backgroundColor = new ThemeColor('statusBarItem.errorBackground')
        } else {
            this.statusBarItem.text = `$(check) AWS CloudFormation (${total})`
            this.statusBarItem.backgroundColor = undefined
        }
    }

    private release(id: number): void {
        this.operations.delete(id)
        this.refCount--

        if (this.refCount === 0) {
            this.disposeTimer = setTimeout(() => {
                this.statusBarItem?.dispose()
                this.statusBarItem = undefined
                this.activeCount = 0
                this.completedCount = 0
                this.failedCount = 0
                this.operations.clear()
            }, 5000)
        }
    }

    showOperations(): void {
        const items: QuickPickItem[] = []

        for (const operation of this.operations.values()) {
            const icon = getPhaseIcon(operation.phase)
            const elapsed = formatElapsed(operation.startTime)
            const changeSetInfo = operation.changeSetName ? ` • ${operation.changeSetName}` : ''

            items.push({
                label: `${icon} ${operation.stackName}`,
                description: `${operation.type}${changeSetInfo}`,
                detail: `${getPhaseLabel(operation.phase)} • Started ${elapsed}`,
            })
        }

        if (items.length === 0) {
            items.push({
                label: '$(info) No active operations',
                description: '',
            })
        }

        const quickPick = window.createQuickPick()
        quickPick.items = items
        quickPick.placeholder = 'AWS CloudFormation Operations'
        quickPick.canSelectMany = false
        quickPick.matchOnDescription = false
        quickPick.matchOnDetail = false
        quickPick.show()

        quickPick.onDidHide(() => quickPick.dispose())
    }
}

const sharedStatusBar = new SharedStatusBar()

function isTerminalPhase(phase: StackActionPhase): boolean {
    return [
        StackActionPhase.VALIDATION_COMPLETE,
        StackActionPhase.VALIDATION_FAILED,
        StackActionPhase.DEPLOYMENT_COMPLETE,
        StackActionPhase.DEPLOYMENT_FAILED,
    ].includes(phase)
}

function isFailurePhase(phase: StackActionPhase): boolean {
    return [StackActionPhase.VALIDATION_FAILED, StackActionPhase.DEPLOYMENT_FAILED].includes(phase)
}

function getPhaseIcon(phase: StackActionPhase): string {
    if (isFailurePhase(phase)) {
        return '$(error)'
    }
    if (isTerminalPhase(phase)) {
        return '$(check)'
    }
    return '$(sync~spin)'
}

function getPhaseLabel(phase: StackActionPhase): string {
    switch (phase) {
        case StackActionPhase.VALIDATION_IN_PROGRESS:
            return 'Validating'
        case StackActionPhase.VALIDATION_COMPLETE:
            return 'Validated'
        case StackActionPhase.VALIDATION_FAILED:
            return 'Validation Failed'
        case StackActionPhase.DEPLOYMENT_IN_PROGRESS:
            return 'Deploying'
        case StackActionPhase.DEPLOYMENT_COMPLETE:
            return 'Deployed'
        case StackActionPhase.DEPLOYMENT_FAILED:
            return 'Deployment Failed'
        default:
            return 'Processing'
    }
}

function formatElapsed(startTime: Date): string {
    const elapsed = Math.floor((Date.now() - startTime.getTime()) / 1000)
    if (elapsed < 60) {
        return `${elapsed}s ago`
    }
    const minutes = Math.floor(elapsed / 60)
    return `${minutes}m ago`
}

export function createDeploymentStatusBar(
    stackName: string,
    type: 'Validation' | 'Deployment',
    changeSetName?: string
): StatusBarHandle {
    return sharedStatusBar.acquire(stackName, type, changeSetName)
}

export function updateWorkflowStatus(handle: StatusBarHandle, status: StackActionPhase): void {
    handle.update(status)
}

export function registerStatusBarCommand(): void {
    commands.registerCommand(commandKey('showOperationStatus'), () => {
        sharedStatusBar.showOperations()
    })
}
