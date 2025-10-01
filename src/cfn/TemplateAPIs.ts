import { LanguageClient } from 'vscode-languageclient/node';
import {
    TemplateMetadataParams,
    GetParametersResult,
    GetParametersRequest,
    GetCapabilitiesResult,
    GetCapabilitiesRequest,
    TemplateValidationCreateRequest,
    TemplateDeploymentCreateRequest,
    TemplateValidationStatusRequest,
    TemplateDeploymentStatusRequest,
    TemplateActionParams,
    TemplateActionResult,
    TemplateStatusResult,
} from './TemplateRequestType';
import { Identifiable } from '../LspTypes';

export async function validateTemplate(
    client: LanguageClient,
    params: TemplateActionParams,
): Promise<TemplateActionResult> {
    return await client.sendRequest(TemplateValidationCreateRequest, params);
}

export async function deployTemplate(
    client: LanguageClient,
    params: TemplateActionParams,
): Promise<TemplateActionResult> {
    return await client.sendRequest(TemplateDeploymentCreateRequest, params);
}

export async function getTemplateValidationStatus(
    client: LanguageClient,
    params: Identifiable,
): Promise<TemplateStatusResult> {
    return await client.sendRequest(TemplateValidationStatusRequest, params);
}

export async function getTemplateDeploymentStatus(
    client: LanguageClient,
    params: Identifiable,
): Promise<TemplateStatusResult> {
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
