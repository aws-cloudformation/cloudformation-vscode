import { window } from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
import { ResourceTypesRequest, ListResourcesRequest, ResourceList } from '../cfn/ResourceRequestTypes';

export interface ResourceSelectionResult {
    resourceType: string;
    resourceIdentifier: string;
}

export class ResourceSelector {
    constructor(private client: LanguageClient) {}

    async selectResourceTypes(selectedTypes: string[] = []): Promise<string[] | undefined> {
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

            const selectedItems = await window.showQuickPick(quickPickItems, {
                canPickMany: true,
                placeHolder: 'Select AWS resource types to import',
                title: 'Select Resource Types',
            });

            return selectedItems?.map((item) => item.label);
        } catch (error) {
            console.error('Failed to get resource types:', error);
            window.showErrorMessage('Failed to get available resource types');
            return undefined;
        }
    }

    async selectResourcesForImport(): Promise<ResourceSelectionResult[]> {
        try {
            // Step 1: Select multiple resource types
            const selectedTypes = await this.selectResourceTypes();
            if (!selectedTypes || selectedTypes.length === 0) {
                return [];
            }

            const allSelections: ResourceSelectionResult[] = [];

            // Step 2: For each resource type, get and select resources
            for (const resourceType of selectedTypes) {
                const resourceIdentifiers = await this.getResourceIdentifiers(resourceType);
                if (resourceIdentifiers.length === 0) {
                    window.showWarningMessage(`No resources found for type: ${resourceType}`);
                    continue;
                }

                // Step 3: Select multiple resources for this type
                const selectedIdentifiers = await window.showQuickPick(resourceIdentifiers, {
                    canPickMany: true,
                    placeHolder: `Select ${resourceType} resources to import`,
                    title: `Select ${resourceType} Resources`,
                });

                if (selectedIdentifiers && selectedIdentifiers.length > 0) {
                    // Add all combinations to the selection list
                    selectedIdentifiers.forEach((identifier) => {
                        allSelections.push({ resourceType, resourceIdentifier: identifier });
                    });
                }
            }

            return allSelections;
        } catch (error) {
            console.error('Failed to select resources for import:', error);
            window.showErrorMessage('Failed to select resources for import');
            return [];
        }
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
