import { Parameter, Capability, ResourceChangeDetail } from '@aws-sdk/client-cloudformation';
import { Identifiable } from '../../LspTypes';

export type CreateStackActionParams = Identifiable & {
    uri: string;
    stackName: string;
    parameters?: Parameter[];
    capabilities?: Capability[];
};

export type CreateStackActionResult = Identifiable & {
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

export type StackChange = {
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

export enum StackActionPhase {
    VALIDATION_STARTED = 'VALIDATION_STARTED',
    DEPLOYMENT_STARTED = 'DEPLOYMENT_STARTED',
    VALIDATION_IN_PROGRESS = 'VALIDATION_IN_PROGRESS',
    DEPLOYMENT_IN_PROGRESS = 'DEPLOYMENT_IN_PROGRESS',
    VALIDATION_COMPLETE = 'VALIDATION_COMPLETE',
    VALIDATION_FAILED = 'VALIDATION_FAILED',
    DEPLOYMENT_COMPLETE = 'DEPLOYMENT_COMPLETE',
    DEPLOYMENT_FAILED = 'DEPLOYMENT_FAILED',
}

export enum StackActionState {
    IN_PROGRESS = 'IN_PROGRESS',
    SUCCESSFUL = 'SUCCESSFUL',
    FAILED = 'FAILED',
}

export type GetStackActionStatusResult = Identifiable & {
    phase: StackActionPhase;
    state: StackActionState;
    changes?: StackChange[];
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

export type TemplateUri = string;
