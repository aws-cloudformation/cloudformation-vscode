import { LanguageClient } from 'vscode-languageclient/node';
import {
    TemplateUri,
    GetParametersResult,
    GetCapabilitiesResult,
    CreateStackActionParams,
    CreateStackActionResult,
    GetStackActionStatusResult,
} from './StackActionRequestType';
import {
    GetParametersRequest,
    GetCapabilitiesRequest,
    CreateValidationRequest,
    CreateDeploymentRequest,
    GetValidationStatusRequest,
    GetDeploymentStatusRequest,
} from './StackActionProtocol';
import { Identifiable } from '../../LspTypes';

export async function validate(
    client: LanguageClient,
    params: CreateStackActionParams,
): Promise<CreateStackActionResult> {
    return await client.sendRequest(CreateValidationRequest, params);
}

export async function deploy(
    client: LanguageClient,
    params: CreateStackActionParams,
): Promise<CreateStackActionResult> {
    return await client.sendRequest(CreateDeploymentRequest, params);
}

export async function getValidationStatus(
    client: LanguageClient,
    params: Identifiable,
): Promise<GetStackActionStatusResult> {
    return await client.sendRequest(GetValidationStatusRequest, params);
}

export async function getDeploymentStatus(
    client: LanguageClient,
    params: Identifiable,
): Promise<GetStackActionStatusResult> {
    return await client.sendRequest(GetDeploymentStatusRequest, params);
}

export async function getParameters(client: LanguageClient, params: TemplateUri): Promise<GetParametersResult> {
    return await client.sendRequest(GetParametersRequest, params);
}

export async function getCapabilities(client: LanguageClient, params: TemplateUri): Promise<GetCapabilitiesResult> {
    return await client.sendRequest(GetCapabilitiesRequest, params);
}
