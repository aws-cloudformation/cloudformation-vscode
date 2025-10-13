/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseLspInstaller } from '../../../shared/lsp/baseLspInstaller'
import { ResourcePaths, Manifest, LspResolution } from '../../../shared/lsp/types'
import { GitHubManifestAdapter } from './githubManifestAdapter'
import { CloudFrontManifestAdapter } from './cloudFrontManifestAdapter'
import { LanguageServerResolver } from '../../../shared/lsp/lspResolver'
import { tryStageResolvers } from '../../../shared/lsp/utils/setupStage'
import { fs } from '../../../shared/fs/fs'
import { Range } from 'semver'
import * as path from 'path'
import { getCloudFormationLspConfig, CloudFormationLspConfig } from './config'

export class CfnLspInstaller extends BaseLspInstaller<ResourcePaths, CloudFormationLspConfig> {
    // @ts-expect-error
    private githubAdapter: GitHubManifestAdapter
    private cloudFrontAdapter: CloudFrontManifestAdapter

    constructor(lspConfig: CloudFormationLspConfig = getCloudFormationLspConfig()) {
        super(lspConfig, 'awsCfnLsp')

        this.githubAdapter = new GitHubManifestAdapter('aws', 'cloudformation-language-server')
        this.cloudFrontAdapter = new CloudFrontManifestAdapter(this.config.manifestUrl, this.config.environment)
    }

    override async resolve(): Promise<LspResolution<ResourcePaths>> {
        const { path } = this.config
        if (path) {
            return {
                assetDirectory: path,
                location: 'override',
                version: '0.0.0',
                resourcePaths: this.resourcePaths(path, '0.0.0'),
            }
        }

        const manifest = await this.resolveManifest()

        const installationResult = await new LanguageServerResolver(
            manifest,
            this.config.id,
            new Range(this.config.supportedVersions, { includePrerelease: true }),
            this.config.manifestUrl,
            this.config.suppressPromptPrefix
        ).resolve()

        await this.postInstall(installationResult.assetDirectory, installationResult.version)

        return {
            assetDirectory: installationResult.assetDirectory,
            location: installationResult.location,
            version: installationResult.version,
            resourcePaths: this.resourcePaths(installationResult.assetDirectory, installationResult.version),
        }
    }

    protected async resolveManifest(): Promise<Manifest> {
        const resolvers = [
            // {
            //     resolve: async () => {
            //         console.log('CloudFormation LSP: Trying GitHub...')
            //         const result = await this.githubAdapter.getManifest()
            //         console.log('CloudFormation LSP: GitHub succeeded')
            //         return result
            //     },
            //     telemetryMetadata: { }
            // },
            {
                resolve: async () => {
                    const result = await this.cloudFrontAdapter.getManifest()
                    return result
                },
                telemetryMetadata: {},
            },
        ]

        const result = await tryStageResolvers('getManifest', resolvers, (m) => ({
            manifestSchemaVersion: m.manifestSchemaVersion,
        }))
        return result
    }

    protected async postInstall(assetDirectory: string, version?: string): Promise<void> {
        // Set executable permissions on Unix systems
        const serverPath = this.resourcePaths(assetDirectory, version).lsp

        if (process.platform !== 'win32') {
            if (await fs.existsFile(serverPath)) {
                await fs.chmod(serverPath, 0o755)
            }
        }
    }

    protected resourcePaths(assetDirectory?: string, version?: string): ResourcePaths {
        if (!assetDirectory) {
            return {
                lsp: '',
                node: process.execPath,
            }
        }

        // For local override paths, use the directory directly
        if (!version || version === '0.0.0') {
            return {
                lsp: path.join(assetDirectory, 'cfn-lsp-server-standalone.js'),
                node: process.execPath,
            }
        }

        // For downloaded versions, extract the short version from the manifest version
        // Manifest version: "0.0.1-202510070233-alpha" -> Extract: "0.0.1-alpha"
        const shortVersion = version.replace(/-\d{12}/, '')
        const platform = process.platform === 'win32' ? 'win32' : process.platform
        const arch = process.arch
        const extractedDirName = `cloudformation-languageserver-${shortVersion}-${platform}-${arch}`

        return {
            lsp: path.join(assetDirectory, extractedDirName, 'cfn-lsp-server-standalone.js'),
            node: process.execPath,
        }
    }

    protected override downloadMessageOverride = 'Updating CloudFormation Language Server'
}
