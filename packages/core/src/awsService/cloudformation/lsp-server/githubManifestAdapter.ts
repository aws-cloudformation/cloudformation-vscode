/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Manifest, LspVersion, Target } from '../../../shared/lsp/types'

interface GitHubRelease {
    tagName: string
    assets: GitHubAsset[]
    prerelease: boolean
}

interface GitHubAsset {
    name: string
    browserDownloadUrl: string
    size: number
}

export class GitHubManifestAdapter {
    constructor(
        private readonly repoOwner: string,
        private readonly repoName: string
    ) {}

    async getManifest(): Promise<Manifest> {
        const releases = await this.fetchGitHubReleases()
        return {
            manifestSchemaVersion: '1.0',
            artifactId: 'cloudformation-lsp',
            artifactDescription: 'CloudFormation Language Server',
            isManifestDeprecated: false,
            versions: releases.map((release) => this.convertRelease(release)),
        }
    }

    private async fetchGitHubReleases(): Promise<GitHubRelease[]> {
        const response = await fetch(`https://api.github.com/repos/${this.repoOwner}/${this.repoName}/releases`)
        if (!response.ok) {
            throw new Error(`GitHub API error: ${response.status}`)
        }
        return response.json()
    }

    private convertRelease(release: GitHubRelease): LspVersion {
        return {
            serverVersion: release.tagName.replace(/^v/, ''),
            isDelisted: release.prerelease,
            targets: this.extractTargets(release.assets),
        }
    }

    private extractTargets(assets: GitHubAsset[]): Target[] {
        const platformMap: Record<string, string> = {
            linux: 'linux',
            darwin: 'darwin',
            win: 'windows',
            windows: 'windows',
        }

        const archMap: Record<string, string> = {
            x64: 'x64',
            arm64: 'arm64',
            amd64: 'x64',
        }

        const targets: Target[] = []
        const grouped = new Map<string, GitHubAsset[]>()

        for (const asset of assets.filter((a) => a.name.endsWith('.zip'))) {
            const key = this.extractPlatformArch(asset.name, platformMap, archMap)
            if (key) {
                if (!grouped.has(key)) {
                    grouped.set(key, [])
                }
                grouped.get(key)!.push(asset)
            }
        }

        for (const [key, assets] of grouped) {
            const [platform, arch] = key.split('-')
            targets.push({
                platform,
                arch,
                contents: assets.map((asset) => ({
                    filename: asset.name,
                    url: asset.browserDownloadUrl,
                    hashes: [],
                    bytes: asset.size,
                })),
            })
        }

        return targets
    }

    private extractPlatformArch(
        filename: string,
        platformMap: Record<string, string>,
        archMap: Record<string, string>
    ): string | undefined {
        const lower = filename.toLowerCase()

        let platform = ''
        let arch = ''

        for (const [key, value] of Object.entries(platformMap)) {
            if (lower.includes(key)) {
                platform = value
                break
            }
        }

        for (const [key, value] of Object.entries(archMap)) {
            if (lower.includes(key)) {
                arch = value
                break
            }
        }

        return platform && arch ? `${platform}-${arch}` : undefined
    }
}
