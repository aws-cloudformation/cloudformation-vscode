/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Disposable, Uri, window, workspace } from 'vscode'
import { Auth } from '../../../auth/auth'
import { extractErrorMessage, formatMessage, toString } from '../utils'
import {
    CfnConfig,
    EnvironmentConfig,
    EnvironmentLookup,
    DeploymentFile,
    DeploymentFileDetails as DeploymentFileDetail,
} from './cfnProjectTypes'
import path from 'path'
import fs from '../../../shared/fs/fs'
import * as yaml from 'js-yaml'
import { EnvironmentSelector } from '../ui/environmentSelector'
import { DeploymentFileSelector } from '../ui/deploymentFileSelector'
import globals from '../../../shared/extensionGlobals'
import { OnStackFailure, Parameter, Tag } from '@aws-sdk/client-cloudformation'
import { TemplateParameter } from '../stacks/actions/stackActionRequestType'
import { validateParameterValue } from '../stacks/actions/stackActionInputValidation'
import { getLogger } from '../../../shared/logger/logger'

export class EnvironmentManager implements Disposable {
    private readonly cfnProjectPath = 'cfn-project'
    private readonly configFile = 'cfn-config.json'
    private readonly environmentsDirectory = 'environments'
    private readonly selectedEnvironmentKey = 'aws.cloudformation.selectedEnvironment'
    private readonly auth = Auth.instance
    private listeners: (() => void)[] = []

    constructor(
        private readonly environmentSelector: EnvironmentSelector,
        private readonly deploymentFileSelector: DeploymentFileSelector
    ) {}

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

    public async selectDeploymentFile(
        templateUri: string,
        requiredParameters: TemplateParameter[]
    ): Promise<DeploymentFileDetail | undefined> {
        const environmentName = this.getSelectedEnvironmentName()
        const fileDetails: DeploymentFileDetail[] = []
        let fileNames: string[] = []
        let environmentDir: string

        if (!environmentName) {
            return undefined
        }

        try {
            environmentDir = await this.getEnvironmentDir(environmentName)
            const files = await fs.readdir(environmentDir)

            fileNames = files
                .filter(
                    ([fileName]) =>
                        fileName.endsWith('.json') || fileName.endsWith('.yaml') || fileName.endsWith('.yml')
                )
                .map(([fileName]) => fileName)
        } catch (error) {
            void window.showErrorMessage(`Error loading deployment files: ${extractErrorMessage(error)}`)
            return undefined
        }

        for (const fileName of fileNames) {
            const deploymentFileInfo = await this.getDeploymentFileInfo(
                fileName,
                environmentDir,
                requiredParameters,
                templateUri
            )

            if (deploymentFileInfo) {
                fileDetails.push(deploymentFileInfo)
            }
        }

        return await this.deploymentFileSelector.selectDeploymentFile(fileDetails, requiredParameters.length)
    }

    private async getDeploymentFileInfo(
        fileName: string,
        environmentDir: string,
        requiredParameters: TemplateParameter[],
        templateUri: string
    ): Promise<DeploymentFileDetail | undefined> {
        try {
            const deploymentFile = await this.loadDeploymentFile(environmentDir, fileName)

            if (!deploymentFile) {
                return
            }

            let compatibleParams: Parameter[] = []

            if (deploymentFile.parameters) {
                const parameters = deploymentFile.parameters

                // Filter to only parameters that exist and are valid
                const validParams = requiredParameters.filter((templateParam) => {
                    if (!(templateParam.name in parameters)) {
                        return false
                    }
                    const value = deploymentFile.parameters![templateParam.name]
                    return validateParameterValue(value, templateParam) === undefined
                })

                compatibleParams = this.convertParametersToCloudFormation(
                    deploymentFile.parameters,
                    validParams.map((p) => p.name)
                )
            }

            return {
                fileName: fileName,
                hasMatchingTemplatePath:
                    workspace.asRelativePath(Uri.parse(templateUri)) === deploymentFile.templateFilePath,
                compatibleParameters: compatibleParams,
                optionalFlags: {
                    tags: deploymentFile.tags ? this.convertTagsToCloudFormation(deploymentFile.tags) : undefined,
                    includeNestedStacks: deploymentFile.includeNestedStacks,
                    importExistingResources: deploymentFile.importExistingResources,
                    onStackFailure: deploymentFile.onStackFailure,
                }
            }
        } catch (error) {
            getLogger().warn(`Failed to parse parameter file ${fileName}:`, error)
        }
    }

    private convertParametersToCloudFormation(
        parameters: Record<string, string>,
        requiredParameters: string[]
    ): Parameter[] {
        return Object.entries(parameters)
            .filter(([key]) => requiredParameters.includes(key))
            .map(([key, value]) => ({
                ParameterKey: key,
                ParameterValue: value,
            }))
    }

    private convertTagsToCloudFormation(tags: Record<string, string>): Tag[] {
        return Object.entries(tags).map(([key, value]) => ({
            Key: key,
            Value: value,
        }))
    }

    private async loadDeploymentFile(environmentDir: string, fileName: string): Promise<DeploymentFile | undefined> {
        const content = await fs.readFileText(path.join(environmentDir, fileName))

        const parsed = fileName.endsWith('.json') ? JSON.parse(content) : yaml.load(content)

        if (this.isDeploymentFile(parsed)) {
            const deploymentFile = parsed as Record<string, unknown>

            // Convert kebab-case to camelCase
            return {
                templateFilePath: deploymentFile['template-file-path'] as string,
                parameters: deploymentFile['parameters'] as Record<string, string>,
                tags: deploymentFile['tags'] as Record<string, string>,
                includeNestedStacks: deploymentFile['include-nested-stacks'] as boolean,
                importExistingResources: deploymentFile['import-existing-resources'] as boolean,
                onStackFailure: deploymentFile['on-stack-failure'] as OnStackFailure,
            }
        }
    }

    private isDeploymentFile(obj: unknown): boolean {
        if (typeof obj !== 'object' || obj === null) {
            return false
        }

        const candidate = obj as Record<string, unknown>

        // Reject empty file
        if (Object.keys(candidate).length === 0) {
            return false
        }

        if ('parameters' in candidate && !this.isStringRecord(candidate.parameters)) {
            return false
        }
        if ('template-file-path' in candidate && typeof candidate['template-file-path'] !== 'string') {
            return false
        }
        if ('tags' in candidate && !this.isStringRecord(candidate.tags)) {
            return false
        }
        if ('include-nested-stacks' in candidate && typeof candidate['include-nested-stacks'] !== 'boolean') {
            return false
        }
        if ('import-existing-resources' in candidate && typeof candidate['import-existing-resources'] !== 'boolean') {
            return false
        }
        if ('on-stack-failure' in candidate && !this.isValidOnStackFailure(candidate['on-stack-failure'])) {
            return false
        }

        // Ensure at least one valid deployment file field is present
        const validFields = [
            'parameters',
            'template-file-path',
            'tags',
            'include-nested-stacks',
            'import-existing-resources',
            'on-stack-failure',
        ]
        return validFields.some((field) => field in candidate)
    }

    private isStringRecord(obj: unknown): obj is Record<string, string> {
        return typeof obj === 'object' && obj !== null && Object.values(obj).every((v) => typeof v === 'string')
    }

    private isValidOnStackFailure(value: unknown): value is string {
        return typeof value === 'string' && ['DO_NOTHING', 'ROLLBACK', 'DELETE'].includes(value)
    }

    private async getEnvironmentDir(environmentName: string): Promise<string> {
        const workspaceRoot = workspace.workspaceFolders?.[0]?.uri.fsPath
        if (!workspaceRoot) {
            throw new Error('No workspace folder found')
        }
        return path.join(workspaceRoot, this.cfnProjectPath, this.environmentsDirectory, environmentName)
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
