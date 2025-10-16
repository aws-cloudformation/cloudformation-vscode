/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { CreateStackActionParams } from './stackActionRequestType'
import { Parameter, Capability } from '@aws-sdk/client-cloudformation'

export function createStackActionParams(
    id: string,
    uri: string,
    stackName: string,
    parameters?: Parameter[],
    capabilities?: Capability[]
): CreateStackActionParams {
    return { id, uri, stackName, parameters, capabilities }
}
