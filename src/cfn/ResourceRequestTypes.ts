import { RequestType, CodeAction, CodeActionParams } from 'vscode-languageserver-protocol';

export interface ListResourcesParams {
    resourceTypes?: string[];
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ResourceTypesParams {}

export interface ResourceTypesResult {
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
    'aws/cfn/resources/list',
);

export const RefreshResourcesRequest = new RequestType<ListResourcesParams, ListResourcesResult, void>(
    'aws/cfn/resources/refresh',
);

export const ResourceTypesRequest = new RequestType<ResourceTypesParams, ResourceTypesResult, void>(
    'aws/cfn/resources/types',
);

export type ResourceSelection = {
    resourceType: string;
    resourceIdentifiers: string[];
};

export enum ResourceStatePurpose {
    Import = 'Import',
    Clone = 'Clone',
}

export interface ResourceStateParams extends CodeActionParams {
    resourceSelections?: ResourceSelection[];
    purpose: ResourceStatePurpose;
}

export type ResourceType = string;
export type ResourceIdentifier = string;

export interface ResourceStateResult extends CodeAction {
    successfulImports: Map<ResourceType, ResourceIdentifier[]>;
    failedImports: Map<ResourceType, ResourceIdentifier[]>;
}

export const ResourceStateRequest = new RequestType<ResourceStateParams, ResourceStateResult, void>(
    'aws/cfn/resources/state',
);
