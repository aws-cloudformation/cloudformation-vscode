import { RequestType, CodeAction, CodeActionParams } from 'vscode-languageserver-protocol';

export interface ListResourcesParams {
    resourceTypes?: string[];
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface GetResourceTypesParams {}

export interface GetResourceTypesResult {
    resourceTypes: string[];
}

export interface ResourceList {
    typeName: string;
    resourceIdentifiers: string[];
}

export interface ListResourcesResult {
    resources: ResourceList[];
}

export const ListResourcesRequest = new RequestType<ListResourcesParams, ListResourcesResult, void>(
    'aws/cfn/resources',
);

export const RefreshResourceListRequest = new RequestType<ListResourcesParams, ListResourcesResult, void>(
    'aws/cfn/refreshResourceList',
);

export const GetResourceTypesRequest = new RequestType<GetResourceTypesParams, GetResourceTypesResult, void>(
    'aws/cfn/resourceTypes',
);

export type ResourceSelection = {
    resourceType: string;
    resourceIdentifiers: string[];
};

export interface ResourceStateImportParams extends CodeActionParams {
    resourceSelections?: ResourceSelection[];
}

export type ResourceType = string;
export type ResourceIdentifier = string;

export interface ResourceStateImportResult extends CodeAction {
    successfulImports: Map<ResourceType, ResourceIdentifier[]>;
    failedImports: Map<ResourceType, ResourceIdentifier[]>;
}

export const ResourceStateImportRequest = new RequestType<ResourceStateImportParams, ResourceStateImportResult, void>(
    'aws/cfn/resourceStateImport',
);
