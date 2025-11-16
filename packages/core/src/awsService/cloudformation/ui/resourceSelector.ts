/*!
import { getLogger } from '../../../shared/logger'
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { window } from 'vscode'
import { LanguageClient } from 'vscode-languageclient/node'
import { ResourceTypesRequest, ListResourcesRequest, ResourceList } from '../resources/resourceRequestTypes'
import { getLogger } from '../../../shared/logger/logger'

export interface ResourceSelectionResult {
    resourceType: string
    resourceIdentifier: string
}

export class ResourceSelector {
    constructor(private client: LanguageClient) {}

    async selectResourceTypes(selectedTypes: string[] = [], multiSelect = true): Promise<string[] | undefined> {
        try {
            const response = await this.client.sendRequest(ResourceTypesRequest, {})
            const availableTypes = response.resourceTypes

            if (availableTypes.length === 0) {
                void window.showWarningMessage('No resource types available')
                return undefined
            }

            const quickPickItems = availableTypes.map((type: string) => ({
                label: type,
                picked: selectedTypes.includes(type),
            }))

            const result = await window.showQuickPick(quickPickItems, {
                canPickMany: multiSelect,
                placeHolder: 'Select resource types',
                title: 'Select Resource Types',
            })

            if (!result) {
                return undefined
            }

            if (Array.isArray(result)) {
                return result.map((item: { label: string }) => item.label)
            }
            return [(result as { label: string }).label]
        } catch (error) {
            getLogger().error(`Failed to get resource types: ${error}`)
            void window.showErrorMessage('Failed to get available resource types')
            return undefined
        }
    }

    async selectResources(multiSelect = true, preSelectedTypes?: string[]): Promise<ResourceSelectionResult[]> {
        try {
            let selectedTypes: string[]

            if (preSelectedTypes && preSelectedTypes.length > 0) {
                selectedTypes = preSelectedTypes
            } else {
                const types = await this.selectResourceTypes([], multiSelect)
                if (!types || types.length === 0) {
                    return []
                }
                selectedTypes = types
            }

            const allSelections: ResourceSelectionResult[] = []

            for (const resourceType of selectedTypes) {
                const selections = await this.selectResourceIdentifiers(resourceType, multiSelect)
                allSelections.push(...selections)
            }

            return allSelections
        } catch (error) {
            void window.showErrorMessage('Failed to select resources')
            return []
        }
    }

    private async selectResourceIdentifiers(
        resourceType: string,
        multiSelect: boolean
    ): Promise<ResourceSelectionResult[]> {
        const loadMoreLabel = '$(sync) Load More...'
        const searchLabel = '$(search) Search by Identifier...'
        let identifiers: string[] = []
        let nextToken: string | undefined
        const selections: ResourceSelectionResult[] = []

        while (true) {
            const response = await this.client.sendRequest(ListResourcesRequest, {
                resources: [{ resourceType, nextToken }],
            })

            const resource = response.resources.find((r: { typeName: string }) => r.typeName === resourceType)
            if (!resource) {
                void window.showWarningMessage(`No resources found for type: ${resourceType}`)
                return []
            }

            identifiers = resource.resourceIdentifiers
            nextToken = resource.nextToken

            if (identifiers.length === 0 && !nextToken) {
                void window.showWarningMessage(`No resources found for type: ${resourceType}`)
                return []
            }

            const items = [...identifiers]
            if (nextToken) {
                items.push(loadMoreLabel)
            }
            items.push(searchLabel)

            const result = await window.showQuickPick(items, {
                canPickMany: multiSelect,
                placeHolder: `Select ${resourceType} identifiers`,
                title: `Select ${resourceType} Resources`,
            })

            if (!result) {
                return selections
            }

            const picked = Array.isArray(result) ? result : [result]

            if (picked.includes(loadMoreLabel)) {
                continue
            }

            if (picked.includes(searchLabel)) {
                const identifier = await window.showInputBox({
                    prompt: `Enter ${resourceType} identifier`,
                    placeHolder: 'Resource identifier must match exactly',
                })

                if (identifier) {
                    selections.push({ resourceType, resourceIdentifier: identifier })
                }

                if (!multiSelect) {
                    return selections
                }
                continue
            }

            for (const identifier of picked) {
                selections.push({ resourceType, resourceIdentifier: identifier })
            }

            return selections
        }
    }

    async selectSingleResource(): Promise<ResourceSelectionResult | undefined> {
        const result = await this.selectResources(false)
        return result[0]
    }
}
