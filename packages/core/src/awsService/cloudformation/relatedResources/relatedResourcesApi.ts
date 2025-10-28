/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { LanguageClient } from 'vscode-languageclient'
import {
    GetAuthoredResourceTypesRequest,
    GetRelatedResourceTypesRequest,
    InsertRelatedResourcesRequest,
    RelatedResourcesCodeAction,
    ResourceTypeRequest,
    TemplateUri,
} from './relatedResourcesProtocol'

export async function getAuthoredResourceTypes(client: LanguageClient, templateUri: TemplateUri): Promise<string[]> {
    return client.sendRequest(GetAuthoredResourceTypesRequest, templateUri)
}

export async function getRelatedResourceTypes(client: LanguageClient, params: ResourceTypeRequest): Promise<string[]> {
    return client.sendRequest(GetRelatedResourceTypesRequest, params)
}

export async function insertRelatedResources(
    client: LanguageClient,
    params: InsertRelatedResourcesRequest
): Promise<RelatedResourcesCodeAction> {
    return client.sendRequest(InsertRelatedResourcesRequest, params)
}
