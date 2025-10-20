/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { LanguageClient } from 'vscode-languageclient'
import {
    TemplateUri,
    GetParametersResult,
    GetCapabilitiesResult,
    CreateStackActionParams,
    CreateStackActionResult,
    GetStackActionStatusResult,
    TemplateResource,
} from './stackActionRequestType'
import {
    GetParametersRequest,
    GetCapabilitiesRequest,
    CreateValidationRequest,
    CreateDeploymentRequest,
    GetValidationStatusRequest,
    GetDeploymentStatusRequest,
    GetTemplateResourcesRequest,
} from './stackActionProtocol'
import { Identifiable } from '../../lspTypes'

export async function validate(
    client: LanguageClient,
    params: CreateStackActionParams
): Promise<CreateStackActionResult> {
    return await client.sendRequest(CreateValidationRequest, params)
}

export async function deploy(
    client: LanguageClient,
    params: CreateStackActionParams
): Promise<CreateStackActionResult> {
    return await client.sendRequest(CreateDeploymentRequest, params)
}

export async function getValidationStatus(
    client: LanguageClient,
    params: Identifiable
): Promise<GetStackActionStatusResult> {
    return await client.sendRequest(GetValidationStatusRequest, params)
}

export async function getDeploymentStatus(
    client: LanguageClient,
    params: Identifiable
): Promise<GetStackActionStatusResult> {
    return await client.sendRequest(GetDeploymentStatusRequest, params)
}

export async function getParameters(client: LanguageClient, params: TemplateUri): Promise<GetParametersResult> {
    return await client.sendRequest(GetParametersRequest, params)
}

export async function getCapabilities(client: LanguageClient, params: TemplateUri): Promise<GetCapabilitiesResult> {
    return await client.sendRequest(GetCapabilitiesRequest, params)
}

export async function getTemplateResources(client: LanguageClient, params: TemplateUri): Promise<TemplateResource[]> {
    const result = await client.sendRequest(GetTemplateResourcesRequest, params)
    return result.resources
}
