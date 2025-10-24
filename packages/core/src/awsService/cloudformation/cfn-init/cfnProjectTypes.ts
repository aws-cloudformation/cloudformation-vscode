/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export type EnvironmentConfig = {
    name: string
    profile: string
}

export type CfnConfig = {
    version: string
    project: {
        name: string
        created: string
    }
    environments: EnvironmentLookup
}

export type EnvironmentLookup = Record<string, EnvironmentConfig>
