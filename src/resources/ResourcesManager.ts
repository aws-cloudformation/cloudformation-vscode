import { ResourceSelectionResult, ResourceSelector } from '../ui/ResourceSelector';
import { LanguageClient } from 'vscode-languageclient/node';
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
} from '../cfn/ResourceRequestTypes';
import { ResourceNode } from '../treeview/nodes/ResourceNode';
import { showErrorMessage } from '../ui/Message';
import { Position, ProgressLocation, Range, TextEdit, Uri, window, workspace, WorkspaceEdit, env } from 'vscode';

type ResourcesChangeListener = (resources: ResourceList[]) => void;

export class ResourcesManager {
    private resources: Map<string, ResourceList> = new Map();
    private selectedResourceTypes: string[] = [];
    private readonly listeners: ResourcesChangeListener[] = [];

    constructor(
        private readonly client: LanguageClient,
        private readonly resourceSelector: ResourceSelector,
    ) {}

    addListener(listener: ResourcesChangeListener) {
        this.listeners.push(listener);
    }

    async loadResources(): Promise<void> {
        try {
            if (this.selectedResourceTypes.length === 0) {
                this.resources.clear();
                return;
            }

            const response = await this.client.sendRequest(ListResourcesRequest, {
                resourceTypes: this.selectedResourceTypes,
            });
            this.resources.clear();
            response.resources.forEach((resource) => {
                this.resources.set(resource.typeName, resource);
            });
        } catch (error) {
            console.error('Failed to load resources:', error);
            this.resources.clear();
        } finally {
            this.notifyAllListeners();
        }
    }

    refreshAllResources(): void {
        window.withProgress(
            {
                location: ProgressLocation.Notification,
                title: 'Refreshing All Resources List',
            },
            async () => {
                try {
                    if (this.selectedResourceTypes.length === 0) {
                        return;
                    }

                    const response = await this.client.sendRequest(RefreshResourcesRequest, {
                        resourceTypes: this.selectedResourceTypes,
                    });
                    this.resources.clear();
                    response.resources.forEach((resource) => {
                        this.resources.set(resource.typeName, resource);
                    });
                } catch (error) {
                    console.error('Failed to refresh all resources:', error);
                } finally {
                    this.notifyAllListeners();
                }
            },
        );
    }

    refreshResourceList(resourceType: string): void {
        window.withProgress(
            {
                location: ProgressLocation.Notification,
                title: `Refreshing ${resourceType} Resources List`,
            },
            async () => {
                try {
                    const response = await this.client.sendRequest(RefreshResourcesRequest, {
                        resourceTypes: [resourceType],
                    });

                    const updatedResource = response.resources.find((r) => r.typeName === resourceType);
                    if (updatedResource) {
                        this.resources.set(resourceType, updatedResource);
                    }
                } catch (error) {
                    console.error('Failed to refresh resource:', error);
                } finally {
                    this.notifyAllListeners();
                }
            },
        );
    }

    async selectResourceTypes(): Promise<void> {
        const selectedTypes = await this.resourceSelector.selectResourceTypes(this.selectedResourceTypes);
        if (selectedTypes !== undefined) {
            this.selectedResourceTypes = selectedTypes;
            await this.loadResources();
        }
    }

    async importResourceStates(resourceNode?: ResourceNode): Promise<void> {
        const editor = window.activeTextEditor;
        if (!editor) {
            showErrorMessage('No active editor');
            return;
        }

        try {
            const resourceSelectionsArray = await this.getResourceSelectionArray(resourceNode);
            if (resourceSelectionsArray.length === 0) {
                return;
            }

            const params: ResourceStateParams = {
                textDocument: { uri: editor.document.uri.toString() },
                range: { start: editor.selection.start, end: editor.selection.end },
                context: { diagnostics: [] },
                resourceSelections: resourceSelectionsArray,
                purpose: ResourceStatePurpose.Import,
            };

            window.withProgress(
                {
                    location: ProgressLocation.Notification,
                    title: 'Importing Resource State',
                    cancellable: false,
                },
                async () => {
                    const result = await this.client.sendRequest(ResourceStateRequest.method, params);
                    await this.applyCodeActionEdits(result as ResourceStateResult);
                    const [successCount, failureCount] = this.getSuccessAndFailureCount(result as ResourceStateResult);
                    this.renderResultMessage(successCount, failureCount, ResourceStatePurpose.Import);
                },
            );
        } catch (error) {
            showErrorMessage(
                `Error importing resource state: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }

    private getResourcesToImportInput(selections: ResourceSelectionResult[]): ResourceSelection[] {
        // Group selections by resource type
        const resourceSelections = new Map<string, string[]>();
        for (const selection of selections) {
            const identifiers = resourceSelections.get(selection.resourceType) ?? [];
            identifiers.push(selection.resourceIdentifier);
            resourceSelections.set(selection.resourceType, identifiers);
        }

        // Convert to ResourceSelection[] format expected by server
        return Array.from(resourceSelections.entries()).map(([resourceType, resourceIdentifiers]) => ({
            resourceType,
            resourceIdentifiers,
        }));
    }

    private async applyCodeActionEdits(result: ResourceStateResult) {
        if (result.edit?.changes) {
            const workspaceEdit = new WorkspaceEdit();
            for (const [uri, textEdits] of Object.entries(result.edit.changes)) {
                const vsCodeUri = Uri.parse(uri);
                const vsCodeEdits = (textEdits as TextEdit[]).map(
                    (edit: TextEdit) =>
                        new TextEdit(
                            new Range(
                                new Position(edit.range.start.line, edit.range.start.character),
                                new Position(edit.range.end.line, edit.range.end.character),
                            ),
                            edit.newText,
                        ),
                );
                workspaceEdit.set(vsCodeUri, vsCodeEdits);
            }
            await workspace.applyEdit(workspaceEdit);
        }
    }

    private getSuccessAndFailureCount(result: ResourceStateResult): [number, number] {
        const successCount = Object.values(result.successfulImports ?? {}).reduce(
            (sum: number, ids: string[]) => sum + ids.length,
            0,
        ) as number;
        const failureCount = Object.values(result.failedImports ?? {}).reduce(
            (sum: number, ids: string[]) => sum + ids.length,
            0,
        ) as number;
        return [successCount, failureCount];
    }

    async cloneResourceStates(resourceNode?: ResourceNode): Promise<void> {
        const editor = window.activeTextEditor;
        if (!editor) {
            showErrorMessage('No active editor');
            return;
        }

        try {
            const resourceSelectionsArray = await this.getResourceSelectionArray(resourceNode);
            if (resourceSelectionsArray.length === 0) {
                return;
            }

            const params: ResourceStateParams = {
                textDocument: { uri: editor.document.uri.toString() },
                range: { start: editor.selection.start, end: editor.selection.end },
                context: { diagnostics: [] },
                resourceSelections: resourceSelectionsArray,
                purpose: ResourceStatePurpose.Clone,
            };

            window.withProgress(
                {
                    location: ProgressLocation.Notification,
                    title: 'Cloning Resource State',
                    cancellable: false,
                },
                async () => {
                    const result = await this.client.sendRequest(ResourceStateRequest.method, params);
                    await this.applyCodeActionEdits(result as ResourceStateResult);
                    const [successCount, failureCount] = this.getSuccessAndFailureCount(result as ResourceStateResult);
                    this.renderResultMessage(successCount, failureCount, ResourceStatePurpose.Clone);
                },
            );
        } catch (error) {
            showErrorMessage(`Error cloning resource state: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async getResourceSelectionArray(resourceNode?: ResourceNode): Promise<ResourceSelection[]> {
        let selections: ResourceSelectionResult[];

        if (resourceNode?.resourceList && resourceNode.resourceType) {
            // Called from tree view with specific resource
            selections = [
                {
                    resourceType: resourceNode.resourceType,
                    resourceIdentifier: resourceNode.label,
                },
            ];
        } else {
            selections = await this.resourceSelector.selectResourcesForImport();
        }

        if (selections.length === 0) {
            return [];
        }

        return this.getResourcesToImportInput(selections);
    }

    private renderResultMessage(successCount: number, failureCount: number, purpose: ResourceStatePurpose) {
        const action = purpose === ResourceStatePurpose.Import ? 'imported' : 'cloned';

        if (successCount > 0 && failureCount === 0) {
            window.showInformationMessage(`Successfully ${action} ${successCount} resource(s)`);
        } else if (successCount > 0 && failureCount > 0) {
            window.showWarningMessage(
                `${action.charAt(0).toUpperCase() + action.slice(1)} ${successCount} resource(s), ${failureCount} failed`,
            );
        } else if (failureCount > 0) {
            showErrorMessage(`Failed to ${action.replace('ed', '')} ${failureCount} resource(s)`);
        } else {
            window.showInformationMessage(`No resources were ${action}`);
        }
    }

    private getResourcesArray(): ResourceList[] {
        return Array.from(this.resources.values());
    }

    private notifyAllListeners(): void {
        this.listeners.forEach((listener: ResourcesChangeListener) => {
            listener(this.getResourcesArray());
        });
    }

    reload() {
        void this.refreshAllResources();
    }

    async getStackManagementInfo(resourceNode?: ResourceNode): Promise<void> {
        if (!resourceNode?.resourceIdentifier) {
            showErrorMessage('No resource selected');
            return;
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
                            resourceNode.resourceIdentifier,
                        );
                        return result;
                    },
                )
                .then(async (result) => {
                    if (result.error) {
                        window.showInformationMessage(`${result.error}`);
                        return;
                    }

                    const managementStatus = result.managedByStack
                        ? `Managed by stack: ${result.stackName ?? 'Unknown'}`
                        : 'Not managed by any stack';

                    const message = `Resource: ${result.physicalResourceId}\n${managementStatus}`;

                    if (result.managedByStack && result.stackName && result.stackId) {
                        const action = await window.showInformationMessage(
                            message,
                            'Copy Stack Name',
                            'Copy Stack Arn',
                        );

                        if (action === 'Copy Stack Name') {
                            await env.clipboard.writeText(result.stackName);
                            window.setStatusBarMessage('Stack name copied to clipboard', 3000);
                        }
                        if (action === 'Copy Stack Arn') {
                            await env.clipboard.writeText(result.stackId);
                            window.setStatusBarMessage('Stack arn copied to clipboard', 3000);
                        }
                    } else {
                        window.showInformationMessage(message);
                    }
                });
        } catch (error) {
            showErrorMessage(
                `Error getting stack management info: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }
}
