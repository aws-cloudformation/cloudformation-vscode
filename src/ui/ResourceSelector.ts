import { window } from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
import { ResourceTypesRequest, ListResourcesRequest, ResourceList } from '../cfn/ResourceRequestTypes';

export interface ResourceSelectionResult {
    resourceType: string;
    resourceIdentifier: string;
}

export class ResourceSelector {
    constructor(private client: LanguageClient) {}

    async selectResourceTypes(selectedTypes: string[] = [], multiSelect = true): Promise<string[] | undefined> {
        try {
            const response = await this.client.sendRequest(ResourceTypesRequest, {});
            const availableTypes = response.resourceTypes;

            if (availableTypes.length === 0) {
                window.showWarningMessage('No resource types available');
                return undefined;
            }

            const quickPickItems = availableTypes.map((type) => ({
                label: type,
                picked: selectedTypes.includes(type),
            }));

            const result = await window.showQuickPick(quickPickItems, {
                canPickMany: multiSelect,
                placeHolder: 'Select resource types',
                title: 'Select Resource Types',
            });

            if (!result) {
                return undefined;
            }

            if (Array.isArray(result)) {
                return result.map((item: { label: string }) => item.label);
            }
            return [(result as { label: string }).label];
        } catch (error) {
            console.error('Failed to get resource types:', error);
            window.showErrorMessage('Failed to get available resource types');
            return undefined;
        }
    }

    async selectResources(multiSelect = true): Promise<ResourceSelectionResult[]> {
        try {
            const selectedTypes = await this.selectResourceTypes([], multiSelect);
            if (!selectedTypes || selectedTypes.length === 0) {
                return [];
            }

            const allSelections: ResourceSelectionResult[] = [];

            for (const resourceType of selectedTypes) {
                const resourceIdentifiers = await this.getResourceIdentifiers(resourceType);
                if (resourceIdentifiers.length === 0) {
                    window.showWarningMessage(`No resources found for type: ${resourceType}`);
                    continue;
                }

                const result = await window.showQuickPick(resourceIdentifiers, {
                    canPickMany: multiSelect,
                    placeHolder: `Select ${resourceType} identifiers`,
                    title: `Select ${resourceType} Resources`,
                });

                if (!result) {
                    continue;
                }

                const identifiers = Array.isArray(result) ? result : [result];
                identifiers.forEach((identifier: string) => {
                    allSelections.push({ resourceType, resourceIdentifier: identifier });
                });
            }

            return allSelections;
        } catch (error) {
            window.showErrorMessage('Failed to select resources');
            return [];
        }
    }

    async selectSingleResource(): Promise<ResourceSelectionResult | undefined> {
        const result = await this.selectResources(false);
        return result[0];
    }

    private async getResourceIdentifiers(resourceType: string, cachedResources?: ResourceList[]): Promise<string[]> {
        // First try to use cached resources from CfnPanel
        if (cachedResources) {
            const cachedResource = cachedResources.find((r) => r.typeName === resourceType);
            if (cachedResource) {
                return cachedResource.resourceIdentifiers;
            }
        }

        // If not cached, fetch from server
        try {
            const resourcesResponse = await this.client.sendRequest(ListResourcesRequest, {
                resourceTypes: [resourceType],
            });

            const resources = resourcesResponse.resources.find((r) => r.typeName === resourceType);
            return resources?.resourceIdentifiers ?? [];
        } catch (error) {
            console.error(`Failed to get resources for type ${resourceType}:`, error);
            return [];
        }
    }
}
