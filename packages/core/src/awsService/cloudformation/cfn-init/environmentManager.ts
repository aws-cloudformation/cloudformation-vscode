/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Disposable, window, workspace } from 'vscode'
import { Auth } from '../../../auth/auth'
import { formatMessage, toString } from '../utils'
import { CfnConfig, EnvironmentConfig, EnvironmentLookup } from './cfnProjectTypes'
import path from 'path'
import fs from '../../../shared/fs/fs'
import { EnvironmentSelector } from '../ui/environmentSelector'
import globals from '../../../shared/extensionGlobals'

export class EnvironmentManager implements Disposable {
    private readonly cfnProjectPath = 'cfn-project'
    private readonly configFile = 'cfn-config.json'
    private readonly selectedEnvironmentKey = 'aws.cloudformation.selectedEnvironment'
    private readonly auth = Auth.instance
    private listeners: (() => void)[] = []

    constructor(private readonly environmentSelector: EnvironmentSelector) {}

    public addListener(listener: () => void): void {
        this.listeners.push(listener)
    }

    public getSelectedEnvironmentName(): string | undefined {
        return globals.context.workspaceState.get(this.selectedEnvironmentKey)
    }

    private notifyListeners(): void {
        for (const listener of this.listeners) {
            listener()
        }
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
            await globals.context.workspaceState.update(this.selectedEnvironmentKey, environmentName)

            await this.syncEnvironmentWithProfile(environment)
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
        return path.join(workspaceRoot, this.cfnProjectPath, this.configFile)
    }

    dispose(): void {
        // No resources to dispose
    }
}
