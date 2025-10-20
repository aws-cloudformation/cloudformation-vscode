/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { CreateStackActionParams, ResourceToImport } from './stackActionRequestType'
import { Capability, Parameter } from '@aws-sdk/client-cloudformation'

export function createStackActionParams(
    id: string,
    uri: string,
    stackName: string,
    parameters?: Parameter[],
    capabilities?: Capability[],
    resourcesToImport?: ResourceToImport[]
): CreateStackActionParams {
    return { id, uri, stackName, parameters, capabilities, resourcesToImport }
}
