/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import * as vscode from 'vscode'
import { ChildProcess } from '../../../shared/utilities/processUtils'
import { CfnInitValidation } from './cfnInitValidation'

export interface EnvironmentOption {
    name: string
    awsProfile: string
    parametersFiles?: string[]
}

export class CfnInitCliCaller {
    private binaryPath: string

    constructor(serverRootDir: string) {
        this.binaryPath = path.join(serverRootDir, 'bin', 'cfn-init')
    }

    async createProject(
        projectName: string,
        options?: {
            projectPath?: string
            environments?: EnvironmentOption[]
        }
    ) {
        // Validate project name
        const nameError = CfnInitValidation.validateProjectName(projectName)
        if (nameError) {
            return { success: false, error: nameError }
        }

        const args = ['create', CfnInitValidation.sanitizeForCommand(projectName)]

        if (options?.projectPath) {
            const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd()
            const pathError = CfnInitValidation.validateProjectPath(options.projectPath, workspacePath)
            if (pathError) {
                return { success: false, error: pathError }
            }
            args.push('--project-path', CfnInitValidation.sanitizeForCommand(options.projectPath))
        }

        if (options?.environments && options.environments.length > 0) {
            // Validate all environments
            for (const env of options.environments) {
                const envError = CfnInitValidation.validateEnvironmentName(env.name)
                if (envError) {
                    return { success: false, error: `Environment '${env.name}': ${envError}` }
                }

                const profileError = CfnInitValidation.validateAwsProfile(env.awsProfile)
                if (profileError) {
                    return { success: false, error: `Environment '${env.name}' profile: ${profileError}` }
                }
            }

            const environmentConfig = {
                environments: options.environments.map((env) => ({
                    ...env,
                    name: CfnInitValidation.sanitizeForCommand(env.name),
                    awsProfile: CfnInitValidation.sanitizeForCommand(env.awsProfile),
                })),
            }
            args.push('--environments', JSON.stringify(environmentConfig))
        }

        return this.executeCommand(args)
    }

    async addEnvironments(environments: EnvironmentOption[]) {
        // Validate all environments
        for (const env of environments) {
            const envError = CfnInitValidation.validateEnvironmentName(env.name)
            if (envError) {
                return { success: false, error: `Environment '${env.name}': ${envError}` }
            }

            const profileError = CfnInitValidation.validateAwsProfile(env.awsProfile)
            if (profileError) {
                return { success: false, error: `Environment '${env.name}' profile: ${profileError}` }
            }
        }

        const sanitizedEnvs = environments.map((env) => ({
            ...env,
            name: CfnInitValidation.sanitizeForCommand(env.name),
            awsProfile: CfnInitValidation.sanitizeForCommand(env.awsProfile),
        }))

        const args = ['environment', 'add', '--environments', JSON.stringify({ environments: sanitizedEnvs })]
        return this.executeCommand(args)
    }

    async removeEnvironment(envName: string) {
        const envError = CfnInitValidation.validateEnvironmentName(envName)
        if (envError) {
            return { success: false, error: envError }
        }

        const args = ['environment', 'remove', CfnInitValidation.sanitizeForCommand(envName)]
        return this.executeCommand(args)
    }

    private async executeCommand(args: string[]) {
        const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd()

        try {
            const result = await ChildProcess.run(this.binaryPath, args, {
                spawnOptions: {
                    cwd,
                },
            })

            return result.exitCode === 0
                ? { success: true, output: result.stdout || undefined }
                : { success: false, error: result.stderr || `Process exited with code ${result.exitCode}` }
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : String(error) }
        }
    }
}
