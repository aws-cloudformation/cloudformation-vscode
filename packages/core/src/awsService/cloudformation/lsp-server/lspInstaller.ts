/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseLspInstaller } from '../../../shared/lsp/baseLspInstaller'
import { GitHubManifestAdapter } from './githubManifestAdapter'
import { CloudFrontManifestAdapter } from './cloudFrontManifestAdapter'
import { fs } from '../../../shared/fs/fs'
import { CfnLspName, CfnLspServerEnvType, CfnLspServerFile, CfnLspServerStorageName } from './lspServerConfig'
import { isAutomation, isBeta, isDebugInstance } from '../../../shared/vscode/env'
import { dirname, join } from 'path'
import { getLogger } from '../../../shared/logger/logger'
import { ResourcePaths } from '../../../shared/lsp/types'
import * as nodeFs from 'fs' // eslint-disable-line no-restricted-imports

function determineEnvironment(): CfnLspServerEnvType {
    if (isDebugInstance()) {
        return 'alpha'
    } else if (isBeta() || isAutomation()) {
        return 'beta'
    }
    return 'prod'
}

export class CfnLspInstaller extends BaseLspInstaller {
    private log = getLogger()

    constructor() {
        super(
            {
                manifestUrl: 'github/cloudfront',
                supportedVersions: '0.*.*',
                id: CfnLspName,
                suppressPromptPrefix: 'cfnLsp',
            },
            'awsCfnLsp',
            {
                resolve: async () => {
                    const environment = determineEnvironment()

                    // Try GitHub first
                    try {
                        this.log.info(`Attempting to resolve CloudFormation LSP from GitHub releases (${environment})`)
                        const githubAdapter = new GitHubManifestAdapter(
                            'aws-cloudformation',
                            'cloudformation-languageserver',
                            environment
                        )
                        return await githubAdapter.getManifest()
                    } catch (error) {
                        this.log.warn(`Failed to resolve from GitHub`, error)
                    }

                    // Fallback to CloudFront
                    try {
                        this.log.info(`Falling back to CloudFront for CloudFormation LSP (${environment})`)
                        const cloudFrontAdapter = new CloudFrontManifestAdapter(environment)
                        return await cloudFrontAdapter.getManifest()
                    } catch (error) {
                        this.log.error(`Failed to resolve from CloudFront`, error)
                        throw new Error('Failed to resolve CloudFormation LSP manifest from both GitHub and CloudFront')
                    }
                },
            } as any
        )
    }

    protected async postInstall(assetDirectory: string): Promise<void> {
        await this.migrateLmdbIfNeeded(assetDirectory)
    }

    protected resourcePaths(assetDirectory?: string): ResourcePaths {
        if (!assetDirectory) {
            return {
                lsp: this.config.path ?? CfnLspServerFile,
                node: process.execPath,
            }
        }

        // Find the single extracted directory
        const entries = nodeFs.readdirSync(assetDirectory, { withFileTypes: true })
        const folders = entries.filter((entry) => entry.isDirectory())

        if (folders.length !== 1) {
            throw new Error(`1 or more CloudFormation LSP folders found ${folders}`)
        }

        return {
            lsp: join(assetDirectory, folders[0].name, CfnLspServerFile),
            node: process.execPath,
        }
    }

    private async migrateLmdbIfNeeded(newVersionDir: string): Promise<void> {
        const newDbPath = join(newVersionDir, CfnLspServerStorageName)

        if (await fs.existsDir(newDbPath)) {
            return
        }

        const parentDir = dirname(newVersionDir)
        const versions = await fs.readdir(parentDir)

        for (const [versionDir] of versions) {
            const oldDbPath = join(parentDir, versionDir, CfnLspServerStorageName)
            if (await fs.existsDir(oldDbPath)) {
                await fs.copy(oldDbPath, newDbPath)
                break
            }
        }
    }
}
