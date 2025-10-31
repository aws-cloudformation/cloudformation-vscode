/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    ChangeSetOptionalFlags,
    CreateDeploymentParams,
    CreateValidationParams,
    DeleteChangeSetParams,
    ResourceToImport,
} from './stackActionRequestType'
import { Capability, Parameter } from '@aws-sdk/client-cloudformation'

export function createValidationParams(
    id: string,
    uri: string,
    stackName: string,
    parameters?: Parameter[],
    capabilities?: Capability[],
    resourcesToImport?: ResourceToImport[],
    keepChangeSet?: boolean,
    optionalFlags?: ChangeSetOptionalFlags
): CreateValidationParams {
    return { id, uri, stackName, parameters, capabilities, resourcesToImport, keepChangeSet, ...optionalFlags }
}

export function createDeploymentParams(id: string, stackName: string, changeSetName: string): CreateDeploymentParams {
    return { id, stackName, changeSetName }
}

export function createChangeSetDeletionParams(
    id: string,
    stackName: string,
    changeSetName: string
): DeleteChangeSetParams {
    return { id, stackName, changeSetName }
}
