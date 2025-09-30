import { ResourceSelectionResult, ResourceSelector } from '../ui/ResourceSelector';
import { LanguageClient } from 'vscode-languageclient/node';
import {
    ListResourcesRequest,
    RefreshResourceListRequest,
    ResourceList,
    ResourceStateImportParams,
    ResourceStateImportRequest,
    ResourceStateImportResult,
} from '../cfn/ResourceRequestTypes';
import { ResourceNode } from '../treeview/nodes/ResourceNode';
import { showErrorMessage } from '../ui/Message';
import { Position, ProgressLocation, Range, TextEdit, Uri, window, workspace, WorkspaceEdit } from 'vscode';

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
            this.listeners.forEach((listener: ResourcesChangeListener) => {
                listener(this.getResourcesArray());
            });
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

                    const response = await this.client.sendRequest(RefreshResourceListRequest, {
                        resourceTypes: this.selectedResourceTypes,
                    });
                    this.resources.clear();
                    response.resources.forEach((resource) => {
                        this.resources.set(resource.typeName, resource);
                    });
                } catch (error) {
                    console.error('Failed to refresh all resources:', error);
                } finally {
                    this.listeners.forEach((listener: ResourcesChangeListener) => {
                        listener(this.getResourcesArray());
                    });
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
                    const response = await this.client.sendRequest(RefreshResourceListRequest, {
                        resourceTypes: [resourceType],
                    });

                    const updatedResource = response.resources.find((r) => r.typeName === resourceType);
                    if (updatedResource) {
                        this.resources.set(resourceType, updatedResource);
                    }
                } catch (error) {
                    console.error('Failed to refresh resource:', error);
                } finally {
                    this.listeners.forEach((listener: ResourcesChangeListener) => {
                        listener(this.getResourcesArray());
                    });
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
        try {
            const editor = window.activeTextEditor;
            if (!editor) {
                showErrorMessage('No active editor');
                return;
            }

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
                return;
            }

            // Group selections by resource type
            const resourceSelections = new Map<string, string[]>();
            for (const selection of selections) {
                const identifiers = resourceSelections.get(selection.resourceType) ?? [];
                identifiers.push(selection.resourceIdentifier);
                resourceSelections.set(selection.resourceType, identifiers);
            }

            // Convert to ResourceSelection[] format expected by server
            const resourceSelectionsArray = Array.from(resourceSelections.entries()).map(
                ([resourceType, resourceIdentifiers]) => ({
                    resourceType,
                    resourceIdentifiers,
                }),
            );

            const params: ResourceStateImportParams = {
                textDocument: { uri: editor.document.uri.toString() },
                range: { start: editor.selection.start, end: editor.selection.end },
                context: { diagnostics: [] },
                resourceSelections: resourceSelectionsArray,
            };

            // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
            const result = (await this.client.sendRequest(
                ResourceStateImportRequest.method,
                params,
            )) as ResourceStateImportResult;

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

            // Calculate success and failure counts (Maps are serialized as objects over JSON-RPC)
            const successfulImports = result.successfulImports as unknown as Record<string, string[]>;
            const failedImports = result.failedImports as unknown as Record<string, string[]>;

            const successCount = Object.values(successfulImports).reduce((sum, ids) => sum + ids.length, 0);
            const failureCount = Object.values(failedImports).reduce((sum, ids) => sum + ids.length, 0);

            // Show appropriate message based on results
            if (successCount > 0 && failureCount === 0) {
                window.showInformationMessage(`Successfully imported ${successCount} resource(s)`);
            } else if (successCount > 0 && failureCount > 0) {
                window.showWarningMessage(`Imported ${successCount} resource(s), ${failureCount} failed`);
            } else if (failureCount > 0) {
                showErrorMessage(`Failed to import ${failureCount} resource(s)`);
            }
        } catch (error) {
            showErrorMessage(
                `Error importing resource state: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }

    private getResourcesArray(): ResourceList[] {
        return Array.from(this.resources.values());
    }

    reload() {
        void this.refreshAllResources();
    }
}
