import { LanguageClient } from 'vscode-languageclient/node';
import {
    TemplateMetadataParams,
    GetParametersResult,
    GetCapabilitiesResult,
    StackActionParams,
    StackActionResult,
    StackActionStatusResult,
} from './StackActionRequestType';
import {
    GetParametersRequest,
    GetCapabilitiesRequest,
    TemplateValidationCreateRequest,
    TemplateDeploymentCreateRequest,
    TemplateValidationStatusRequest,
    TemplateDeploymentStatusRequest,
} from './StackActionProtocol';
import { Identifiable } from '../LspTypes';

export async function validateTemplate(client: LanguageClient, params: StackActionParams): Promise<StackActionResult> {
    return await client.sendRequest(TemplateValidationCreateRequest, params);
}

export async function deployTemplate(client: LanguageClient, params: StackActionParams): Promise<StackActionResult> {
    return await client.sendRequest(TemplateDeploymentCreateRequest, params);
}

export async function getTemplateValidationStatus(
    client: LanguageClient,
    params: Identifiable,
): Promise<StackActionStatusResult> {
    return await client.sendRequest(TemplateValidationStatusRequest, params);
}

export async function getTemplateDeploymentStatus(
    client: LanguageClient,
    params: Identifiable,
): Promise<StackActionStatusResult> {
    return await client.sendRequest(TemplateDeploymentStatusRequest, params);
}

export async function getParameters(
    client: LanguageClient,
    params: TemplateMetadataParams,
): Promise<GetParametersResult> {
    return await client.sendRequest(GetParametersRequest, params);
}

export async function getCapabilities(
    client: LanguageClient,
    params: TemplateMetadataParams,
): Promise<GetCapabilitiesResult> {
    return await client.sendRequest(GetCapabilitiesRequest, params);
}
