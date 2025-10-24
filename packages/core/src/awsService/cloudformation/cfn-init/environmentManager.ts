/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Disposable, window, workspace } from 'vscode'
import { Auth } from '../../../auth/auth'
import { formatMessage, toString } from '../utils'
import { CfnConfig, EnvironmentConfig, EnvironmentLookup } from './cfnProjectTypes'
import { globals } from '../../../shared'
import path from 'path'
import fs from '../../../shared/fs/fs'
import { EnvironmentSelector } from '../ui/environmentSelector'

export class EnvironmentManager implements Disposable {
    private readonly CFN_PROJECT_PATH = 'cfn-project'
    private readonly CONFIG_FILE = 'cfn-config.json'
    private readonly SELECTED_ENVIRONMENT_KEY = 'aws.cloudformation.selectedEnvironment'
    private readonly auth = Auth.instance
    private listeners: (() => void)[] = []

    constructor(private readonly environmentSelector: EnvironmentSelector) {}

    public addListener(listener: () => void): void {
        this.listeners.push(listener)
    }

    public getSelectedEnvironmentName(): string | undefined {
        return globals.context.workspaceState.get(this.SELECTED_ENVIRONMENT_KEY)
    }

    private notifyListeners(): void {
        this.listeners.forEach((listener) => listener())
    }

    public async selectEnvironment(): Promise<void> {
        let environmentLookup: EnvironmentLookup

        try {
            environmentLookup = await this.fetchAvailableEnvironments()
        } catch (error) {
            void window.showErrorMessage(
                formatMessage(`Failed to retrieve environments from configuration: ${toString(error)}`)
            )
            return
        }

        const environmentName = await this.environmentSelector.selectEnvironment(environmentLookup)

        if (environmentName) {
            await this.setSelectedEnvironment(environmentName, environmentLookup)
        }
    }

    private async setSelectedEnvironment(environmentName: string, environmentLookup: EnvironmentLookup): Promise<void> {
        const environment = environmentLookup[environmentName]

        if (environment) {
            await globals.context.workspaceState.update(this.SELECTED_ENVIRONMENT_KEY, environmentName)

            this.syncEnvironmentWithProfile(environment)
        }

        this.notifyListeners()
    }

    private async syncEnvironmentWithProfile(environment: EnvironmentConfig) {
        const profileName = environment.profile

        const currentConnection = await this.auth.getConnection({ id: `profile:${profileName}` })

        if (!currentConnection) {
            void window.showErrorMessage(formatMessage(`No connection found for profile: ${profileName}`))
            return
        }

        await this.auth.useConnection(currentConnection)
    }

    public async fetchAvailableEnvironments(): Promise<EnvironmentLookup> {
        const configPath = await this.getConfigPath()
        const config = JSON.parse(await fs.readFileText(configPath)) as CfnConfig

        return config.environments
    }

    private async getConfigPath(): Promise<string> {
        const workspaceRoot = workspace.workspaceFolders?.[0]?.uri.fsPath
        if (!workspaceRoot) {
            throw new Error('No workspace folder found')
        }
        return path.join(workspaceRoot, this.CFN_PROJECT_PATH, this.CONFIG_FILE)
    }

    dispose(): void {
        // No resources to dispose
    }
}
