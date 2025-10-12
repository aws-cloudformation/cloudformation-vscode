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
import { Experiments } from '../../../shared/settings'
import * as vscode from 'vscode'

export class CfnLspInstaller extends BaseLspInstaller<ResourcePaths> {
    // @ts-expect-error
    private githubAdapter: GitHubManifestAdapter
    private cloudFrontAdapter: CloudFrontManifestAdapter

    constructor() {
        super(
            {
                manifestUrl: 'https://d2485r7obgomg5.cloudfront.net/manifest.json',
                supportedVersions: '0.*.*',
                id: 'CloudFormation',
                suppressPromptPrefix: 'cloudformation',
            },
            'awsCfnLsp'
        )

        this.githubAdapter = new GitHubManifestAdapter('aws', 'cloudformation-language-server')
        this.cloudFrontAdapter = new CloudFrontManifestAdapter(this.config.manifestUrl)
    }

    override async resolve(): Promise<LspResolution<ResourcePaths>> {
        // Check for experiment-based local LSP first
        const useLocal = Experiments.instance.get('useLocalCloudFormationLsp', false)
        const envPath = process.env.AWS_CFN_LSP_PATH

        if (useLocal) {
            const lspPath = envPath || (await CfnLspInstaller.findLocalLspPath())
            if (lspPath) {
                return {
                    assetDirectory: lspPath,
                    location: 'override',
                    version: '0.0.0',
                    resourcePaths: this.resourcePaths(lspPath, '0.0.0'),
                }
            } else {
                throw new Error(
                    'CloudFormation LSP: useLocalCloudFormationLsp is enabled but no local LSP server found. Set AWS_CFN_LSP_PATH environment variable or ensure local server exists.'
                )
            }
        }

        // Check for config.path override (original logic)
        const { path } = this.config
        if (path) {
            return {
                assetDirectory: path,
                location: 'override',
                version: '0.0.0',
                resourcePaths: this.resourcePaths(),
            }
        }

        // Fall back to remote download
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

    private static async findLocalLspPath(): Promise<string | undefined> {
        const extensionPath = __dirname
        // Go up to find sibling repositories next to cloudformation-vscode
        const parentDir = path.dirname(
            path.dirname(
                path.dirname(path.dirname(path.dirname(path.dirname(path.dirname(path.dirname(extensionPath))))))
            )
        )

        try {
            const entries = await fs.readdir(parentDir)
            const siblingDirs = entries
                .filter(([, fileType]) => fileType === vscode.FileType.Directory)
                .map(([name]) => name)

            for (const siblingDir of siblingDirs) {
                const serverPath = path.join(
                    parentDir,
                    siblingDir,
                    'bundle',
                    'development',
                    'cfn-lsp-server-standalone.js'
                )
                if (await fs.existsFile(serverPath)) {
                    return path.dirname(serverPath)
                }
            }
        } catch (error) {
            // Fall back if local search fails
        }

        return undefined
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
