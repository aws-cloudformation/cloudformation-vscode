/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import fs from '../../../shared/fs/fs'

export class CfnInitValidation {
    // Valid project name: alphanumeric, hyphens, underscores, 1-64 chars
    private static readonly projectNameRegex = /^[a-zA-Z0-9_-]{1,64}$/

    // Valid environment name: alphanumeric, hyphens, underscores, 1-32 chars
    private static readonly envNameRegex = /^[a-zA-Z0-9_-]{1,32}$/

    // Valid profile name: alphanumeric, hyphens, underscores, periods, 1-64 chars
    private static readonly profileRegex = /^[a-zA-Z0-9._-]{1,64}$/

    static validateProjectName(name: string): string | undefined {
        if (!name || typeof name !== 'string') {
            return 'Project name is required'
        }

        const trimmed = name.trim()
        if (!this.projectNameRegex.test(trimmed)) {
            return 'Project name must be 1-64 characters, alphanumeric with hyphens and underscores only'
        }

        return undefined
    }

    static validateEnvironmentName(name: string): string | undefined {
        if (!name || typeof name !== 'string') {
            return 'Environment name is required'
        }

        const trimmed = name.trim()
        if (!this.envNameRegex.test(trimmed)) {
            return 'Environment name must be 1-32 characters, alphanumeric with hyphens and underscores only'
        }

        return undefined
    }

    static validateAwsProfile(profile: string): string | undefined {
        if (!profile || typeof profile !== 'string') {
            return 'AWS profile is required'
        }

        const trimmed = profile.trim()
        if (!this.profileRegex.test(trimmed)) {
            return 'AWS profile must be 1-64 characters, alphanumeric with hyphens, underscores, and periods only'
        }

        return undefined
    }

    static validateProjectPath(projectPath: string, workspacePath: string): string | undefined {
        if (!projectPath || typeof projectPath !== 'string') {
            return 'Project path is required'
        }

        try {
            const resolvedPath = path.resolve(projectPath)
            const resolvedWorkspace = path.resolve(workspacePath)

            if (!resolvedPath.startsWith(resolvedWorkspace) && !path.isAbsolute(projectPath)) {
                return 'Project path must be within workspace or an absolute path'
            }

            const parentDir = path.dirname(resolvedPath)
            if (!fs.existsDir(parentDir)) {
                return 'Parent directory does not exist'
            }

            return undefined
        } catch (error) {
            return `Invalid path: ${error instanceof Error ? error.message : String(error)}`
        }
    }

    static sanitizeForCommand(input: string): string {
        // Remove any characters that could be used for command injection
        return input.replace(/[;&|`$(){}[\]\\]/g, '')
    }
}
