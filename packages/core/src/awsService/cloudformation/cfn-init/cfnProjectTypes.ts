/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { OnStackFailure, Parameter, Tag } from '@aws-sdk/client-cloudformation'

export type EnvironmentConfig = {
    name: string
    profile: string
}

export type EnvironmentLookup = Record<string, EnvironmentConfig>

export type CfnConfig = {
    version: string
    project: {
        name: string
        created: string
    }
    environments: EnvironmentLookup
}

export type DeploymentFile = {
    templateFilePath?: string
    parameters?: Record<string, string>
    tags?: Record<string, string>
    includeNestedStacks?: boolean
    importExistingResources?: boolean
    onStackFailure?: OnStackFailure
}

export type DeploymentFileDetails = {
    fileName: string
    hasMatchingTemplatePath?: boolean
    compatibleParameters?: Parameter[]
    tags?: Tag[]
    includeNestedStacks?: boolean
    importExistingResources?: boolean
    onStackFailure?: OnStackFailure
}
