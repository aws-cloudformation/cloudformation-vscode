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
    ResourceStackManagementResult,
    ResourceStateParams,
    ResourceStatePurpose,
    ResourceStateRequest,
    ResourceStateResult,
    StackMgmtInfoRequest,
    SearchResourceRequest,
    SearchResourceResult,
} from '../cfn/resourceRequestTypes'
import {
    getAuthoredResourceTypes,
    getRelatedResourceTypes,
    insertRelatedResources,
} from '../relatedResources/relatedResourcesApi'
import { RelatedResourcesCodeAction } from '../relatedResources/relatedResourcesProtocol'

import { showErrorMessage } from '../ui/message'
import {
    Position,
    ProgressLocation,
    Range,
    Selection,
    TextEdit,
    TextEditorRevealType,
    Uri,
    window,
    workspace,
    WorkspaceEdit,
    env,
} from 'vscode'
import { getLogger } from '../../../shared/logger/logger'
import globals from '../../../shared/extensionGlobals'
import { setContext } from '../../../shared/vscode/setContext'

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

            this.resources.clear()

            const response = await this.client.sendRequest(ListResourcesRequest, {
                resources: this.selectedResourceTypes.map((resourceType) => ({ resourceType })),
            })

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

    async loadMoreResources(resourceType: string, nextToken: string): Promise<void> {
        await setContext('aws.cloudformation.loadingResources', true)
        try {
            const response = await this.client.sendRequest(ListResourcesRequest, {
                resources: [{ resourceType, nextToken }],
            })

            if (response.resources.length > 0) {
                this.resources.set(resourceType, response.resources[0])
            }

            this.notifyAllListeners()
        } catch (error) {
            getLogger().error(`Failed to load more resources: ${error}`)
            void window.showErrorMessage(
                `Failed to load more resources: ${error instanceof Error ? error.message : String(error)}`
            )
        } finally {
            await setContext('aws.cloudformation.loadingResources', false)
        }
    }

    refreshAllResources(): void {
        void window.withProgress(
            {
                location: ProgressLocation.Notification,
                title: 'Refreshing All Resources List',
            },
            async () => {
                await setContext('aws.cloudformation.refreshingAllResources', true)
                try {
                    if (this.selectedResourceTypes.length === 0) {
                        return
                    }

                    const response = await this.client.sendRequest(RefreshResourcesRequest, {
                        resources: this.selectedResourceTypes.map((resourceType) => ({ resourceType })),
                    })
                    this.resources.clear()
                    for (const resource of response.resources) {
                        this.resources.set(resource.typeName, resource)
                    }
                } catch (error) {
                    getLogger().error(`Failed to refresh all resources: ${error}`)
                } finally {
                    await setContext('aws.cloudformation.refreshingAllResources', false)
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
                await setContext('aws.cloudformation.refreshingResourceList', true)
                try {
                    const response = await this.client.sendRequest(RefreshResourcesRequest, {
                        resources: [{ resourceType }],
                    })

                    const updatedResource = response.resources.find((r) => r.typeName === resourceType)
                    if (updatedResource) {
                        this.resources.set(resourceType, updatedResource)
                    }
                } catch (error) {
                    getLogger().error(`Failed to refresh resource: ${error}`)
                } finally {
                    await setContext('aws.cloudformation.refreshingResourceList', false)
                    this.notifyAllListeners()
                }
            }
        )
    }

    async searchResource(resourceType: string, identifier: string): Promise<SearchResourceResult> {
        try {
            const response = await this.client.sendRequest(SearchResourceRequest, {
                resourceType,
                identifier,
            })

            if (response.found && response.resource) {
                this.resources.set(resourceType, response.resource)
                this.notifyAllListeners()
            }

            return response
        } catch (error) {
            getLogger().error(`Failed to search resource: ${error}`)
            return { found: false }
        }
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

        const contextKey =
            purpose === ResourceStatePurpose.Import
                ? 'aws.cloudformation.importingResource'
                : 'aws.cloudformation.cloningResource'
        await setContext(contextKey, true)

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
            await window.withProgress(
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
        } finally {
            await setContext(contextKey, false)
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

        if (resourceNodes?.length) {
            selections = resourceNodes.map((node) => ({
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

        await setContext('aws.cloudformation.gettingStackMgmtInfo', true)
        try {
            const result = (await window.withProgress(
                {
                    location: ProgressLocation.SourceControl,
                    title: 'Getting Stack Management Info',
                    cancellable: false,
                },
                async () => {
                    return await this.client.sendRequest(StackMgmtInfoRequest.method, resourceIdentifier)
                }
            )) as ResourceStackManagementResult

            await setContext('aws.cloudformation.gettingStackMgmtInfo', false)

            if (result.managedByStack === true && result.stackName && result.stackId) {
                const action = await window.showInformationMessage(
                    `${result.physicalResourceId} is managed by stack: ${result.stackName}`,
                    this.CopyStackName,
                    this.CopyStackArn
                )

                if (action === this.CopyStackName) {
                    await env.clipboard.writeText(result.stackName)
                    window.setStatusBarMessage('Stack name copied to clipboard', 3000)
                } else if (action === this.CopyStackArn) {
                    await env.clipboard.writeText(result.stackId)
                    window.setStatusBarMessage('Stack ARN copied to clipboard', 3000)
                }
            } else if (result.managedByStack === false) {
                void window.showInformationMessage(`${result.physicalResourceId} is not managed by any stack`)
            } else {
                showErrorMessage(`Failed to determine stack management status: ${result.error ?? 'Unknown error'}`)
            }
        } catch (error) {
            showErrorMessage(
                `Error getting stack management info: ${error instanceof Error ? error.message : String(error)}`
            )
            await setContext('aws.cloudformation.gettingStackMgmtInfo', false)
        }
    }

    async addRelatedResources(preSelectedResourceType?: string): Promise<void> {
        const activeEditor = window.activeTextEditor
        if (!activeEditor) {
            void window.showErrorMessage('No template file opened')
            return
        }

        try {
            const templateUri = activeEditor.document.uri.toString()

            let selectedResourceType = preSelectedResourceType

            if (!selectedResourceType) {
                const resourceTypes = await getAuthoredResourceTypes(this.client, templateUri)
                if (resourceTypes.length === 0) {
                    void window.showInformationMessage('No resources found in the current template')
                    return
                }
                selectedResourceType = await window.showQuickPick(resourceTypes, {
                    placeHolder: 'Select a resource type to add related resources',
                    canPickMany: false,
                })
            }

            if (!selectedResourceType) {
                return
            }

            const action = await window.showQuickPick(['Create new', 'Import existing'], {
                placeHolder: 'How would you like to add related resources?',
                canPickMany: false,
            })

            if (!action) {
                return
            }

            if (action === 'Create new') {
                await this.createRelatedResources(selectedResourceType)
            } else {
                await this.importRelatedResources(selectedResourceType)
            }
        } catch (error) {
            showErrorMessage(
                `Error adding related resources: ${error instanceof Error ? error.message : String(error)}`
            )
        }
    }

    async createRelatedResources(selectedResourceType: string): Promise<void> {
        const activeEditor = window.activeTextEditor
        if (!activeEditor) {
            void window.showErrorMessage('No template file opened')
            return
        }

        const templateUri = activeEditor.document.uri.toString()
        const relatedTypes = await getRelatedResourceTypes(this.client, { resourceType: selectedResourceType })

        if (relatedTypes.length === 0) {
            void window.showInformationMessage(`No related resources found for ${selectedResourceType}`)
            return
        }

        const selectedRelatedTypes = await window.showQuickPick(relatedTypes, {
            placeHolder: 'Select related resources to create',
            canPickMany: true,
        })

        if (!selectedRelatedTypes || selectedRelatedTypes.length === 0) {
            return
        }

        const result = await insertRelatedResources(this.client, {
            templateUri,
            resourceTypes: selectedRelatedTypes,
            selectedResourceType,
        })

        await this.applyCodeAction(result)

        // Scroll to the inserted resources
        if (result.data?.scrollToPosition) {
            const position = new Position(result.data.scrollToPosition.line, result.data.scrollToPosition.character)
            const revealRange = new Range(
                new Position(Math.max(0, position.line - 2), 0),
                new Position(position.line + 8, 0)
            )
            activeEditor.revealRange(revealRange, TextEditorRevealType.InCenter)
        }

        void window.showInformationMessage(`Added ${selectedRelatedTypes.length} related resources`)
    }

    private async applyCodeAction(codeAction: RelatedResourcesCodeAction): Promise<void> {
        if (codeAction.edit?.changes) {
            const workspaceEdit = new WorkspaceEdit()

            for (const [uri, textEdits] of Object.entries(codeAction.edit.changes)) {
                const vsCodeUri = Uri.parse(uri)
                const vsCodeEdits = textEdits.map((edit) => {
                    const range = new Range(
                        new Position(edit.range.start.line, edit.range.start.character),
                        new Position(edit.range.end.line, edit.range.end.character)
                    )
                    return new TextEdit(range, edit.newText)
                })
                workspaceEdit.set(vsCodeUri, vsCodeEdits)
            }

            await workspace.applyEdit(workspaceEdit)
        }
    }

    async importRelatedResources(selectedResourceType: string): Promise<void> {
        const relatedTypes = await getRelatedResourceTypes(this.client, { resourceType: selectedResourceType })

        if (relatedTypes.length === 0) {
            void window.showInformationMessage(`No related resources found for ${selectedResourceType}`)
            return
        }

        const selectedRelatedTypes = await window.showQuickPick(relatedTypes, {
            placeHolder: 'Select related resource types to import',
            canPickMany: true,
        })

        if (!selectedRelatedTypes || selectedRelatedTypes.length === 0) {
            return
        }

        const selections = await this.resourceSelector.selectResources(true, selectedRelatedTypes)

        if (selections.length === 0) {
            return
        }

        const resourceNodes = selections.map((selection) => ({
            resourceType: selection.resourceType,
            resourceIdentifier: selection.resourceIdentifier,
        })) as ResourceNode[]

        await this.importResourceStates(resourceNodes)
    }
}
