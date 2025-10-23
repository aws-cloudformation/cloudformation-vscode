/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { RequestType } from 'vscode-languageserver-protocol'
import { Identifiable } from '../../lspTypes'
import {
    TemplateUri,
    GetParametersResult,
    CreateStackActionParams,
    CreateStackActionResult,
    GetStackActionStatusResult,
    GetCapabilitiesResult,
    GetTemplateResourcesResult,
    ListChangeSetsParams,
    ListChangeSetsResult,
} from './stackActionRequestType'

export const CreateValidationRequest = new RequestType<CreateStackActionParams, CreateStackActionResult, void>(
    'aws/cfn/stack/validation/create'
)

export const CreateDeploymentRequest = new RequestType<CreateStackActionParams, CreateStackActionResult, void>(
    'aws/cfn/stack/deployment/create'
)

export const GetValidationStatusRequest = new RequestType<Identifiable, GetStackActionStatusResult, void>(
    'aws/cfn/stack/validation/status'
)

export const GetDeploymentStatusRequest = new RequestType<Identifiable, GetStackActionStatusResult, void>(
    'aws/cfn/stack/deployment/status'
)

export const GetParametersRequest = new RequestType<TemplateUri, GetParametersResult, void>('aws/cfn/stack/parameters')

export const GetCapabilitiesRequest = new RequestType<TemplateUri, GetCapabilitiesResult, void>(
    'aws/cfn/stack/capabilities'
)

export const GetTemplateResourcesRequest = new RequestType<TemplateUri, GetTemplateResourcesResult, void>(
    'aws/cfn/stack/import/resources'
)

export const ListChangeSetsRequest = new RequestType<ListChangeSetsParams, ListChangeSetsResult, void>(
    'aws/cfn/stack/changeSet/list'
)
