/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Parameter,
    Capability,
    ResourceChangeDetail,
    ResourceStatus,
    DetailedStatus,
} from '@aws-sdk/client-cloudformation'
import { Identifiable } from '../../lspTypes'

export type ResourceToImport = {
    ResourceType: string
    LogicalResourceId: string
    ResourceIdentifier: Record<string, string>
}

export type CreateValidationParams = Identifiable & {
    uri: string
    stackName: string
    parameters?: Parameter[]
    capabilities?: Capability[]
    resourcesToImport?: ResourceToImport[]
    keepChangeSet?: boolean
}

export type ChangeSetReference = {
    changeSetName: string
    stackName: string
}

export type CreateDeploymentParams = Identifiable & ChangeSetReference

export type CreateStackActionResult = Identifiable & ChangeSetReference

export type ValidationResult = {
    level: 'FAIL' | 'WARN' | 'INFO'
    type: string
    validationName: string
    status: 'COMPLETE' | 'FAILED' | 'SKIPPED'
    details: string
    propertyPath?: string
    remediationAction?: string
    detailedStatus?: string
}

export type StackChange = {
    type?: string
    resourceChange?: {
        action?: string
        logicalResourceId?: string
        physicalResourceId?: string
        resourceType?: string
        replacement?: string
        scope?: string[]
        beforeContext?: string
        afterContext?: string
        details?: ResourceChangeDetail[]
    }
    validationResults?: ValidationResult[]
}

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
    phase: StackActionPhase
    state: StackActionState
    changes?: StackChange[]
}

export type ValidationDetail = {
    ValidationName: string
    LogicalId?: string
    ResourcePropertyPath?: string
    Severity: 'INFO' | 'ERROR'
    Message: string
}

export type DeploymentEvent = {
    LogicalResourceId?: string
    ResourceType?: string
    ResourceStatus?: ResourceStatus
    ResourceStatusReason?: string
    DetailedStatus?: DetailedStatus
}

export type Failable = {
    FailureReason?: string
}

export type DescribeValidationStatusResult = GetStackActionStatusResult &
    Failable & {
        ValidationDetails?: ValidationDetail[]
    }

export type DescribeDeploymentStatusResult = GetStackActionStatusResult &
    Failable & {
        DeploymentEvents?: DeploymentEvent[]
    }

export type GetParametersResult = {
    parameters: TemplateParameter[]
}

export type GetCapabilitiesResult = {
    capabilities: Capability[]
}

export type TemplateResource = {
    logicalId: string
    type: string
    primaryIdentifierKeys?: string[]
    primaryIdentifier?: Record<string, string>
}

export type GetTemplateResourcesResult = {
    resources: TemplateResource[]
}

export type TemplateParameter = {
    name: string
    Type?: string
    Default?: string | number | boolean
    Description?: string
    AllowedValues?: (string | number | boolean)[]
    AllowedPattern?: string
    MinLength?: number
    MaxLength?: number
    MinValue?: number
    MaxValue?: number
}

export type TemplateUri = string

export type ChangeSetInfo = {
    changeSetName: string
    status: string
    creationTime?: string
    description?: string
}

export type ListChangeSetsParams = {
    stackName: string
    nextToken?: string
}

export type ListChangeSetsResult = {
    changeSets: ChangeSetInfo[]
    nextToken?: string
}
