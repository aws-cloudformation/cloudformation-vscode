/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Position, Range, TextEdit, TextEditorRevealType, Uri, window, workspace, WorkspaceEdit } from 'vscode'
import { LanguageClient } from 'vscode-languageclient'
import { RelatedResourceSelector } from '../ui/relatedResourceSelector'
import { ResourceSelector } from '../ui/resourceSelector'
import { insertRelatedResources } from './relatedResourcesApi'
import { RelatedResourcesCodeAction } from './relatedResourcesProtocol'
import { showErrorMessage } from '../ui/message'
import { ResourceNode } from '../explorer/nodes/resourceNode'

export class RelatedResourcesManager {
    constructor(
        private client: LanguageClient,
        private selector: RelatedResourceSelector,
        private resourceSelector: ResourceSelector,
        private importResourceStates: (resourceNodes: ResourceNode[]) => Promise<void>
    ) {}

    async addRelatedResources(preSelectedResourceType?: string): Promise<void> {
        const activeEditor = window.activeTextEditor
        if (!activeEditor) {
            void window.showErrorMessage('No template file opened')
            return
        }

        try {
            const templateUri = activeEditor.document.uri.toString()

            const selectedResourceType =
                preSelectedResourceType || (await this.selector.selectAuthoredResourceType(templateUri))

            if (!selectedResourceType) {
                return
            }

            const action = await this.selector.selectAction()
            if (!action) {
                return
            }

            if (action === 'create') {
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

    private async createRelatedResources(selectedResourceType: string): Promise<void> {
        const activeEditor = window.activeTextEditor
        if (!activeEditor) {
            void window.showErrorMessage('No template file opened')
            return
        }

        const selectedRelatedTypes = await this.selector.selectRelatedResourceTypes(selectedResourceType)
        if (!selectedRelatedTypes || selectedRelatedTypes.length === 0) {
            return
        }

        const templateUri = activeEditor.document.uri.toString()
        const result = await insertRelatedResources(this.client, {
            templateUri,
            resourceTypes: selectedRelatedTypes,
            selectedResourceType,
        })

        await this.applyCodeAction(result)

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

    private async importRelatedResources(selectedResourceType: string): Promise<void> {
        const selectedRelatedTypes = await this.selector.selectRelatedResourceTypes(selectedResourceType)
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
