import { LanguageClient } from 'vscode-languageclient/node';
import {
    StackActionMetadataParams,
    GetParametersResult,
    GetCapabilitiesResult,
    StackActionParams,
    StackActionResult,
    StackActionStatusResult,
} from './StackActionRequestType';
import {
    StackActionParametersRequest,
    StackActionCapabilitiesRequest,
    StackActionValidationCreateRequest,
    StackActionDeploymentCreateRequest,
    StackActionValidationStatusRequest,
    StackActionDeploymentStatusRequest,
} from './StackActionProtocol';
import { Identifiable } from '../../LspTypes';

export async function validateTemplate(client: LanguageClient, params: StackActionParams): Promise<StackActionResult> {
    return await client.sendRequest(StackActionValidationCreateRequest, params);
}

export async function deployTemplate(client: LanguageClient, params: StackActionParams): Promise<StackActionResult> {
    return await client.sendRequest(StackActionDeploymentCreateRequest, params);
}

export async function getTemplateValidationStatus(
    client: LanguageClient,
    params: Identifiable,
): Promise<StackActionStatusResult> {
    return await client.sendRequest(StackActionValidationStatusRequest, params);
}

export async function getTemplateDeploymentStatus(
    client: LanguageClient,
    params: Identifiable,
): Promise<StackActionStatusResult> {
    return await client.sendRequest(StackActionDeploymentStatusRequest, params);
}

export async function getParameters(
    client: LanguageClient,
    params: StackActionMetadataParams,
): Promise<GetParametersResult> {
    return await client.sendRequest(StackActionParametersRequest, params);
}

export async function getCapabilities(
    client: LanguageClient,
    params: StackActionMetadataParams,
): Promise<GetCapabilitiesResult> {
    return await client.sendRequest(StackActionCapabilitiesRequest, params);
}
