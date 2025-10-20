/*!
import { getLogger } from '../../../shared/logger'
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ResourceSelectionResult, ResourceSelector } from '../ui/resourceSelector'
import { ResourceNode } from '../explorer/nodes/resourceNode'
import { LanguageClient } from 'vscode-languageclient'
import {
    ListResourcesRequest,
    RefreshResourcesRequest,
    ResourceList,
    ResourceSelection,
    ResourceStateParams,
    ResourceStatePurpose,
    ResourceStateRequest,
    ResourceStateResult,
    StackMgmtInfoRequest,
    ResourceStackManagementResult,
} from '../cfn/resourceRequestTypes'

import { showErrorMessage } from '../ui/message'
import {
    Position,
    ProgressLocation,
    Range,
    Selection,
    TextEdit,
    Uri,
    window,
    workspace,
    WorkspaceEdit,
    env,
} from 'vscode'
import { getLogger } from '../../../shared/logger/logger'
import globals from '../../../shared/extensionGlobals'

type ResourcesChangeListener = (resources: ResourceList[]) => void

export class ResourcesManager {
    private resources: Map<string, ResourceList> = new Map()
    private readonly listeners: ResourcesChangeListener[] = []
    private static readonly resourceTypesKey = 'aws.cloudformation.selectedResourceTypes'

    private readonly CopyStackName = 'Copy Stack Name'
    private readonly CopyStackArn = 'Copy Stack Arn'

    constructor(
        private readonly client: LanguageClient,
        private readonly resourceSelector: ResourceSelector
    ) {}

    private get selectedResourceTypes(): string[] {
        return globals.globalState.tryGet<string[]>(ResourcesManager.resourceTypesKey, Object, [])
    }

    private async setSelectedResourceTypes(types: string[]): Promise<void> {
        await globals.globalState.update(ResourcesManager.resourceTypesKey, types)
    }

    get(): ResourceList[] {
        return Array.from(this.resources.values())
    }

    addListener(listener: ResourcesChangeListener) {
        this.listeners.push(listener)
    }

    async loadResources(): Promise<void> {
        try {
            if (this.selectedResourceTypes.length === 0) {
                this.resources.clear()
                return
            }

            const response = await this.client.sendRequest(ListResourcesRequest, {
                resourceTypes: this.selectedResourceTypes,
            })
            this.resources.clear()
            for (const resource of response.resources) {
                this.resources.set(resource.typeName, resource)
            }
        } catch (error) {
            getLogger().error(`Failed to load resources: ${error}`)
            this.resources.clear()
        } finally {
            this.notifyAllListeners()
        }
    }

    refreshAllResources(): void {
        void window.withProgress(
            {
                location: ProgressLocation.Notification,
                title: 'Refreshing All Resources List',
            },
            async () => {
                try {
                    if (this.selectedResourceTypes.length === 0) {
                        return
                    }

                    const response = await this.client.sendRequest(RefreshResourcesRequest, {
                        resourceTypes: this.selectedResourceTypes,
                    })
                    this.resources.clear()
                    for (const resource of response.resources) {
                        this.resources.set(resource.typeName, resource)
                    }
                } catch (error) {
                    getLogger().error(`Failed to refresh all resources: ${error}`)
                } finally {
                    this.notifyAllListeners()
                }
            }
        )
    }

    refreshResourceList(resourceType: string): void {
        void window.withProgress(
            {
                location: ProgressLocation.Notification,
                title: `Refreshing ${resourceType} Resources List`,
            },
            async () => {
                try {
                    const response = await this.client.sendRequest(RefreshResourcesRequest, {
                        resourceTypes: [resourceType],
                    })

                    const updatedResource = response.resources.find((r) => r.typeName === resourceType)
                    if (updatedResource) {
                        this.resources.set(resourceType, updatedResource)
                    }
                } catch (error) {
                    getLogger().error(`Failed to refresh resource: ${error}`)
                } finally {
                    this.notifyAllListeners()
                }
            }
        )
    }

    async selectResourceTypes(): Promise<void> {
        const selectedTypes = await this.resourceSelector.selectResourceTypes(this.selectedResourceTypes)
        if (selectedTypes !== undefined) {
            await this.setSelectedResourceTypes(selectedTypes)
            await this.loadResources()
        }
    }

    private async executeResourceStateOperation(
        resourceNodes: ResourceNode[] | undefined,
        purpose: ResourceStatePurpose
    ): Promise<void> {
        const editor = window.activeTextEditor
        if (!editor) {
            showErrorMessage('No active editor')
            return
        }

        try {
            const resourceSelectionsArray = await this.getResourceSelectionArray(resourceNodes)
            if (resourceSelectionsArray.length === 0) {
                return
            }

            const params: ResourceStateParams = {
                textDocument: { uri: editor.document.uri.toString() },
                range: { start: editor.selection.start, end: editor.selection.end },
                context: { diagnostics: [] },
                resourceSelections: resourceSelectionsArray,
                purpose,
            }

            const title =
                purpose === ResourceStatePurpose.Import ? 'Importing Resource State' : 'Cloning Resource State'
            void window.withProgress(
                {
                    location: ProgressLocation.Notification,
                    title,
                    cancellable: false,
                },
                async () => {
                    const result = (await this.client.sendRequest(
                        ResourceStateRequest.method,
                        params
                    )) as ResourceStateResult
                    if (result.warning) {
                        void window.showWarningMessage(result.warning)
                    }
                    await this.applyCodeActionEdits(result)
                    const [successCount, failureCount] = this.getSuccessAndFailureCount(result)
                    this.renderResultMessage(successCount, failureCount, purpose)
                }
            )
        } catch (error) {
            const action = purpose === ResourceStatePurpose.Import ? 'importing' : 'cloning'
            showErrorMessage(
                `Error ${action} resource state: ${error instanceof Error ? error.message : String(error)}`
            )
        }
    }

    async importResourceStates(resourceNodes?: ResourceNode[]): Promise<void> {
        await this.executeResourceStateOperation(resourceNodes, ResourceStatePurpose.Import)
    }

    private getResourcesToImportInput(selections: ResourceSelectionResult[]): ResourceSelection[] {
        // Group selections by resource type
        const resourceSelections = new Map<string, string[]>()
        for (const selection of selections) {
            const identifiers = resourceSelections.get(selection.resourceType) ?? []
            identifiers.push(selection.resourceIdentifier)
            resourceSelections.set(selection.resourceType, identifiers)
        }

        // Convert to ResourceSelection[] format expected by server
        return Array.from(resourceSelections.entries()).map(([resourceType, resourceIdentifiers]) => ({
            resourceType,
            resourceIdentifiers,
        }))
    }

    private async applyCodeActionEdits(result: ResourceStateResult) {
        if (result.edit?.changes) {
            const workspaceEdit = new WorkspaceEdit()
            let firstEditUri: Uri | undefined
            let firstEditRange: Range | undefined
            let hasPlaceholder = false

            for (const [uri, textEdits] of Object.entries(result.edit.changes)) {
                const vsCodeUri = Uri.parse(uri)
                firstEditUri ??= vsCodeUri

                const vsCodeEdits = (textEdits as TextEdit[]).map((edit: TextEdit) => {
                    const range = new Range(
                        new Position(edit.range.start.line, edit.range.start.character),
                        new Position(edit.range.end.line, edit.range.end.character)
                    )

                    firstEditRange ??= range

                    if (edit.newText.includes('${1:')) {
                        hasPlaceholder = true
                    }

                    return new TextEdit(range, edit.newText)
                })
                workspaceEdit.set(vsCodeUri, vsCodeEdits)
            }

            await workspace.applyEdit(workspaceEdit)

            if (hasPlaceholder && firstEditUri && firstEditRange) {
                await this.repositionCursorToFirstPlaceholder(firstEditUri, firstEditRange)
            }
        }
    }

    private async repositionCursorToFirstPlaceholder(uri: Uri, searchStartRange: Range): Promise<void> {
        const document = await workspace.openTextDocument(uri)
        const editor = await window.showTextDocument(document)
        const searchStartOffset = document.offsetAt(searchStartRange.start)
        const text = document.getText()
        const textFromStart = text.substring(searchStartOffset)

        const placeholderMatch = textFromStart.match(/\$\{1:([^}]+)\}/)
        if (placeholderMatch) {
            const placeholderStart = searchStartOffset + textFromStart.indexOf(placeholderMatch[0])
            const placeholderEnd = placeholderStart + placeholderMatch[0].length

            const startPos = document.positionAt(placeholderStart)
            const endPos = document.positionAt(placeholderEnd)

            editor.selection = new Selection(startPos, endPos)
            editor.revealRange(new Range(startPos, endPos))
        }
    }

    private getSuccessAndFailureCount(result: ResourceStateResult): [number, number] {
        const successCount = Object.values(result.successfulImports ?? {}).reduce(
            (sum: number, ids: string[]) => sum + ids.length,
            0
        ) as number
        const failureCount = Object.values(result.failedImports ?? {}).reduce(
            (sum: number, ids: string[]) => sum + ids.length,
            0
        ) as number
        return [successCount, failureCount]
    }

    async cloneResourceStates(resourceNodes?: ResourceNode[]): Promise<void> {
        await this.executeResourceStateOperation(resourceNodes, ResourceStatePurpose.Clone)
    }

    private async getResourceSelectionArray(resourceNodes?: ResourceNode[]): Promise<ResourceSelection[]> {
        let selections: ResourceSelectionResult[]

        if (resourceNodes && resourceNodes.length > 0) {
            selections = resourceNodes
                .filter(
                    (node): node is ResourceNode & { resourceType: string } =>
                        !!node.resourceList && !!node.resourceType && !!node.resourceIdentifier
                )
                .map((node) => ({
                    resourceType: node.resourceType,
                    resourceIdentifier: node.resourceIdentifier,
                }))
        } else {
            selections = await this.resourceSelector.selectResources()
        }

        if (selections.length === 0) {
            return []
        }

        return this.getResourcesToImportInput(selections)
    }

    private renderResultMessage(successCount: number, failureCount: number, purpose: ResourceStatePurpose) {
        const action = purpose === ResourceStatePurpose.Import ? 'imported' : 'cloned'

        if (successCount > 0 && failureCount === 0) {
            void window.showInformationMessage(`Successfully ${action} ${successCount} resource(s)`)
        } else if (successCount > 0 && failureCount > 0) {
            void window.showWarningMessage(
                `${action.charAt(0).toUpperCase() + action.slice(1)} ${successCount} resource(s), ${failureCount} failed`
            )
        } else if (failureCount > 0) {
            showErrorMessage(`Failed to ${action.replace('ed', '')} ${failureCount} resource(s)`)
        } else {
            void window.showInformationMessage(`No resources were ${action}`)
        }
    }

    private getResourcesArray(): ResourceList[] {
        return Array.from(this.resources.values())
    }

    private notifyAllListeners(): void {
        for (const listener of this.listeners) {
            listener(this.getResourcesArray())
        }
    }

    reload() {
        void this.refreshAllResources()
    }

    async getStackManagementInfo(resourceNode?: ResourceNode): Promise<void> {
        let resourceIdentifier: string | undefined

        if (resourceNode?.resourceIdentifier) {
            resourceIdentifier = resourceNode.resourceIdentifier
        } else {
            const selection = await this.resourceSelector.selectSingleResource()
            if (!selection) {
                return
            }
            resourceIdentifier = selection.resourceIdentifier
        }

        try {
            await window
                .withProgress(
                    {
                        location: ProgressLocation.Notification,
                        title: 'Getting Stack Management Info',
                        cancellable: false,
                    },
                    async () => {
                        const result: ResourceStackManagementResult = await this.client.sendRequest(
                            StackMgmtInfoRequest.method,
                            resourceIdentifier
                        )
                        return result
                    }
                )
                .then(async (result) => {
                    if (result.error) {
                        void window.showInformationMessage(`${result.error}`)
                        return
                    }

                    const managementStatus = result.managedByStack
                        ? `Managed by stack: ${result.stackName ?? 'Unknown'}`
                        : 'Not managed by any stack'

                    const message = `Resource: ${result.physicalResourceId}\n${managementStatus}`

                    if (result.managedByStack && result.stackName && result.stackId) {
                        const action = await window.showInformationMessage(
                            message,
                            this.CopyStackName,
                            this.CopyStackArn
                        )

                        if (action === this.CopyStackName) {
                            await env.clipboard.writeText(result.stackName)
                            window.setStatusBarMessage('Stack name copied to clipboard', 3000)
                        } else if (action === this.CopyStackArn) {
                            await env.clipboard.writeText(result.stackId)
                            window.setStatusBarMessage('Stack arn copied to clipboard', 3000)
                        }
                    } else {
                        void window.showInformationMessage(message)
                    }
                })
        } catch (error) {
            showErrorMessage(
                `Error getting stack management info: ${error instanceof Error ? error.message : String(error)}`
            )
        }
    }
}
