/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Manifest, LspVersion, Target } from '../../../shared/lsp/types'

interface CloudFrontManifest {
    description: string
    environments: {
        [env: string]: {
            versions: string[]
            latest: string | null
            targets: {
                [version: string]: CloudFrontTarget[]
            }
        }
    }
}

interface CloudFrontTarget {
    version: string
    platform: string
    arch: string
    filename: string
    path: string
}

export class CloudFrontManifestAdapter {
    constructor(private readonly manifestUrl: string) {}

    async getManifest(): Promise<Manifest> {
        const response = await fetch(this.manifestUrl)
        if (!response.ok) {
            throw new Error(`CloudFront manifest error: ${response.status}`)
        }

        const cfManifest: CloudFrontManifest = await response.json()

        // Use alpha environment for now
        const alphaEnv = cfManifest.environments.alpha
        if (!alphaEnv || alphaEnv.versions.length === 0) {
            throw new Error('No alpha versions available')
        }

        return {
            manifestSchemaVersion: '1.0',
            artifactId: 'cloudformation-lsp',
            artifactDescription: 'CloudFormation Language Server',
            isManifestDeprecated: false,
            versions: alphaEnv.versions.map((version) => this.convertVersion(version, alphaEnv.targets[version])),
        }
    }

    private convertVersion(version: string, targets: CloudFrontTarget[]): LspVersion {
        const groupedTargets = new Map<string, CloudFrontTarget[]>()

        // Group by platform-arch
        for (const target of targets) {
            const key = `${target.platform}-${target.arch}`
            if (!groupedTargets.has(key)) {
                groupedTargets.set(key, [])
            }
            groupedTargets.get(key)!.push(target)
        }

        const lspTargets: Target[] = []
        for (const [key, targets] of groupedTargets) {
            const [platform, arch] = key.split('-')
            lspTargets.push({
                platform,
                arch,
                contents: targets.map((target) => ({
                    filename: target.filename,
                    url: `https://d2485r7obgomg5.cloudfront.net${target.path}`,
                    hashes: [],
                    bytes: 19033213, // Use the actual size we saw from curl
                })),
            })
        }

        return {
            serverVersion: version.replace(/^v/, ''),
            isDelisted: false,
            targets: lspTargets,
        }
    }
}
