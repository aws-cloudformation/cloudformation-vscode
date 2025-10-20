/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { RegionProvider } from '../../../shared/regions/regionProvider'
import { isNonNullable } from '../../../shared/utilities/tsUtils'
import globals from '../../../shared/extensionGlobals'

const localize = nls.loadMessageBundle()

export class CloudFormationRegionManager {
    private static readonly storageKey = 'aws.cloudformation.regions'

    constructor(private readonly regionProvider: RegionProvider) {}

    public getSelectedRegions(): string[] {
        const cfnRegions = globals.globalState.tryGet<string[]>(CloudFormationRegionManager.storageKey, Object, [])

        // If no CloudFormation regions selected, use AWS explorer regions as default
        if (cfnRegions.length === 0) {
            const awsExplorerRegions = globals.globalState.tryGet<string[]>('region', Object, [])
            return awsExplorerRegions.length > 0 ? awsExplorerRegions : ['us-east-1']
        }

        return cfnRegions
    }

    public async updateSelectedRegions(regions: string[]): Promise<void> {
        await globals.globalState.update(CloudFormationRegionManager.storageKey, Array.from(new Set(regions)))
    }

    public async showRegionSelector(): Promise<boolean> {
        const currentRegions = new Set(this.getSelectedRegions())
        const allRegions = this.regionProvider.getRegions()

        const items: vscode.QuickPickItem[] = allRegions.map((r) => ({
            label: r.name,
            detail: r.id,
            picked: currentRegions.has(r.id),
        }))

        const placeholder = localize(
            'cloudformation.showHideRegionPlaceholder',
            'Select regions to show in CloudFormation panel (unselect to hide)'
        )

        const result = await vscode.window.showQuickPick(items, {
            placeHolder: placeholder,
            canPickMany: true,
            matchOnDetail: true,
        })

        if (!result) {
            return false
        }

        const selected = result.map((res) => res.detail).filter(isNonNullable)
        if (selected.length !== currentRegions.size || selected.some((r) => !currentRegions.has(r))) {
            await this.updateSelectedRegions(selected)
            return true
        }

        return false
    }
}
