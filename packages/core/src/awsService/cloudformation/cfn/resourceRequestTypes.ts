/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { RequestType, CodeAction, CodeActionParams } from 'vscode-languageserver-protocol'

export interface ListResourcesParams {
    resourceTypes?: string[]
}

export interface ResourceTypesParams {}

export interface ResourceTypesResult {
    resourceTypes: string[]
}

export interface ResourceList {
    typeName: string
    resourceIdentifiers: string[]
}

export interface ListResourcesResult {
    resources: ResourceList[]
}

export const ListResourcesRequest = new RequestType<ListResourcesParams, ListResourcesResult, void>(
    'aws/cfn/resources/list'
)

export const RefreshResourcesRequest = new RequestType<ListResourcesParams, ListResourcesResult, void>(
    'aws/cfn/resources/refresh'
)

export const ResourceTypesRequest = new RequestType<ResourceTypesParams, ResourceTypesResult, void>(
    'aws/cfn/resources/types'
)

export type ResourceSelection = {
    resourceType: string
    resourceIdentifiers: string[]
}

export enum ResourceStatePurpose {
    Import = 'Import',
    Clone = 'Clone',
}

export interface ResourceStateParams extends CodeActionParams {
    resourceSelections?: ResourceSelection[]
    purpose: ResourceStatePurpose
}

export type ResourceType = string
export type ResourceIdentifier = string

export interface ResourceStateResult extends CodeAction {
    successfulImports: Map<ResourceType, ResourceIdentifier[]>
    failedImports: Map<ResourceType, ResourceIdentifier[]>
    warning?: string
}

export const ResourceStateRequest = new RequestType<ResourceStateParams, ResourceStateResult, void>(
    'aws/cfn/resources/state'
)

export type ResourceStackManagementResult = {
    physicalResourceId: string
    managedByStack: boolean | undefined
    stackName?: string
    stackId?: string
    error?: string
}

export const StackMgmtInfoRequest = new RequestType<ResourceIdentifier, ResourceStackManagementResult, void>(
    'aws/cfn/resources/stackMgmtInfo'
)
