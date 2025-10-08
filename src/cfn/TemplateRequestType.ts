import { Parameter, Capability, ResourceChangeDetail } from '@aws-sdk/client-cloudformation';
import { RequestType } from 'vscode-languageserver-protocol';
import { Identifiable } from '../LspTypes';

export type TemplateActionParams = Identifiable & {
    uri: string;
    stackName: string;
    parameters?: Parameter[];
    capabilities?: Capability[];
};

export type TemplateActionResult = Identifiable & {
    id: string;
    changeSetName: string;
    stackName: string;
};

export type ValidationResult = {
    level: 'FAIL' | 'WARN' | 'INFO';
    type: string;
    validationName: string;
    status: 'COMPLETE' | 'FAILED' | 'SKIPPED';
    details: string;
    propertyPath?: string;
    remediationAction?: string;
    detailedStatus?: string;
};

export type TemplateChange = {
    type?: string;
    resourceChange?: {
        action?: string;
        logicalResourceId?: string;
        physicalResourceId?: string;
        resourceType?: string;
        replacement?: string;
        scope?: string[];
        beforeContext?: string;
        afterContext?: string;
        details?: ResourceChangeDetail[];
    };
    validationResults?: ValidationResult[];
};

export enum TemplateStatus {
    VALIDATION_STARTED = 'VALIDATION_STARTED',
    DEPLOYMENT_STARTED = 'DEPLOYMENT_STARTED',
    VALIDATION_IN_PROGRESS = 'VALIDATION_IN_PROGRESS',
    DEPLOYMENT_IN_PROGRESS = 'DEPLOYMENT_IN_PROGRESS',
    VALIDATION_COMPLETE = 'VALIDATION_COMPLETE',
    VALIDATION_FAILED = 'VALIDATION_FAILED',
    DEPLOYMENT_COMPLETE = 'DEPLOYMENT_COMPLETE',
    DEPLOYMENT_FAILED = 'DEPLOYMENT_FAILED',
}

export enum WorkflowResult {
    IN_PROGRESS = 'IN_PROGRESS',
    SUCCESSFUL = 'SUCCESSFUL',
    FAILED = 'FAILED',
}

export type TemplateStatusResult = Identifiable & {
    status: TemplateStatus;
    result: WorkflowResult;
    changes?: TemplateChange[];
};

export type TemplateMetadataParams = {
    uri: string;
};

export type GetParametersResult = {
    parameters: TemplateParameter[];
};

export type GetCapabilitiesResult = {
    capabilities: Capability[];
};

export type TemplateParameter = {
    name: string;
    Type?: string;
    Default?: string | number | boolean;
    Description?: string;
    AllowedValues?: (string | number | boolean)[];
    AllowedPattern?: string;
    MinLength?: number;
    MaxLength?: number;
    MinValue?: number;
    MaxValue?: number;
};

export const TemplateValidationCreateRequest = new RequestType<TemplateActionParams, TemplateActionResult, void>(
    'aws/cfn/template/validation/create',
);

export const TemplateDeploymentCreateRequest = new RequestType<TemplateActionParams, TemplateActionResult, void>(
    'aws/cfn/template/deployment/create',
);

export const TemplateValidationStatusRequest = new RequestType<Identifiable, TemplateStatusResult, void>(
    'aws/cfn/template/validation/status',
);

export const TemplateDeploymentStatusRequest = new RequestType<Identifiable, TemplateStatusResult, void>(
    'aws/cfn/template/deployment/status',
);

export const GetParametersRequest = new RequestType<TemplateMetadataParams, GetParametersResult, void>(
    'aws/cfn/template/parameters',
);

export const GetCapabilitiesRequest = new RequestType<TemplateMetadataParams, GetCapabilitiesResult, void>(
    'aws/cfn/template/capabilities',
);
