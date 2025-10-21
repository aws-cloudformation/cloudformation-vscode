/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Manifest, LspVersion, Target } from '../../../shared/lsp/types'
import { CfnLspName, CfnLspServerEnvType } from './LspServerConfig'
import { addWindows, dedupeAndGetLatestVersions } from './remote/Utils'

interface CloudFrontTarget {
    version: string
    platform: string
    arch: string
    filename: string
    path: string
}

interface EnvironmentType {
    versions: string[]
    latest?: string
    targets: {
        [key: string]: CloudFrontTarget[]
    }
}

interface CloudFrontManifest {
    description: string
    environments: {
        alpha: EnvironmentType
        beta: EnvironmentType
        prod: EnvironmentType
    }
}

const baseUrl = 'https://d2485r7obgomg5.cloudfront.net'

export class CloudFrontManifestAdapter {
    constructor(private readonly environment: CfnLspServerEnvType) {}

    async getManifest(): Promise<Manifest> {
        const response = await fetch(`${baseUrl}/manifest.json`)
        if (!response.ok) {
            throw new Error(`CloudFront manifest error: ${response.status}`)
        }

        const cfManifest: CloudFrontManifest = await response.json()
        const env = cfManifest.environments[this.environment]

        if (!env || env.versions.length === 0) {
            throw new Error(`No ${this.environment} versions available`)
        }

        const allVersions = Object.keys(env.targets).sort((a, b) => b.localeCompare(a))

        return {
            manifestSchemaVersion: '1.0',
            artifactId: CfnLspName,
            artifactDescription: `CloudFront ${cfManifest.description}`,
            isManifestDeprecated: false,
            versions: dedupeAndGetLatestVersions(
                allVersions.map((version) => this.convertVersion(version, env.targets[version] || []))
            ),
        }
    }

    private convertVersion(version: string, targets: CloudFrontTarget[]): LspVersion {
        const lspTargets: Target[] = []
        for (const target of targets) {
            lspTargets.push({
                platform: target.platform,
                arch: target.arch,
                contents: [
                    {
                        filename: target.filename,
                        url: `${baseUrl}${target.path}`,
                        hashes: [],
                        bytes: 19033213, // Use the actual size we saw from curl
                    },
                ],
            })
        }

        return {
            serverVersion: version,
            isDelisted: false,
            targets: addWindows(lspTargets),
        }
    }
}
