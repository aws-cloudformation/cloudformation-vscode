/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { window, workspace, Uri } from 'vscode'
import { validateStackName, validateParameterValue } from '../stacks/actions/stackActionInputValidation'
import { Parameter, Capability } from '@aws-sdk/client-cloudformation'
import { TemplateParameter, ResourceToImport, TemplateResource } from '../stacks/actions/stackActionRequestType'
import { DocumentManager } from '../documents/documentManager'
import path from 'path'
import fs from '../../../shared/fs/fs'

export async function getTemplatePath(documentManager: DocumentManager): Promise<string | undefined> {
    const validTemplates = documentManager
        .get()
        .filter((doc) => doc.cfnType === 'template')
        .map((doc) => {
            const uri = doc.uri

            return {
                label: doc.fileName,
                description: workspace.asRelativePath(Uri.parse(uri)),
                uri: uri,
            }
        })
        .sort((a, b) => a.label.localeCompare(b.label))

    const selected = await window.showQuickPick(validTemplates, {
        placeHolder: 'Select CloudFormation template',
        ignoreFocusOut: true,
    })

    if (!selected) {
        return undefined
    }

    return selected.uri
}

export async function getStackName(prefill?: string): Promise<string | undefined> {
    return await window.showInputBox({
        prompt: 'Enter the CloudFormation stack name',
        value: prefill,
        validateInput: validateStackName,
        ignoreFocusOut: true,
    })
}

export async function getParameterValues(
    templateParameters: TemplateParameter[],
    prefillParameters?: Parameter[]
): Promise<Parameter[] | undefined> {
    const parameters: Parameter[] = []

    for (const param of templateParameters) {
        const prefillValue = prefillParameters?.find((p) => p.ParameterKey === param.name)?.ParameterValue
        const value = await getParameterValue(param, prefillValue)
        if (value) {
            parameters.push(value)
        }
    }

    return parameters
}

async function getParameterValue(parameter: TemplateParameter, prefill?: string): Promise<Parameter | undefined> {
    const prompt = `Enter value for parameter "${parameter.name}"${parameter.Description ? ` - ${parameter.Description}` : ''}`
    const placeHolder = parameter.Default ? `Default: ${parameter.Default}` : (parameter.Type ?? 'String')
    const allowedInfo = parameter.AllowedValues ? ` (Allowed: ${parameter.AllowedValues.join(', ')})` : ''

    const value = await window.showInputBox({
        prompt: prompt + allowedInfo,
        placeHolder,
        value: prefill ?? parameter.Default?.toString(),
        validateInput: (input: string) => validateParameterValue(input, parameter),
        ignoreFocusOut: true,
    })

    if (value === undefined) {
        return undefined
    }

    return { ParameterKey: parameter.name, ParameterValue: value }
}

export async function confirmCapabilities(capabilities: Capability[]): Promise<Capability[] | undefined> {
    // Confirm if user wants to use detected capabilities
    const useDetected = await window.showQuickPick(['Yes', 'No, modify capabilities'], {
        placeHolder: `Use capabilities: ${capabilities.join(', ') || '(none)'}?`,
        canPickMany: false,
    })

    if (!useDetected) {
        return undefined // User cancelled
    }

    if (useDetected === 'Yes') {
        return capabilities
    }

    // Allow user to modify capabilities
    const allCapabilities: Capability[] = [
        Capability.CAPABILITY_IAM,
        Capability.CAPABILITY_NAMED_IAM,
        Capability.CAPABILITY_AUTO_EXPAND,
    ]

    const selected = await window.showQuickPick(
        allCapabilities.map((cap) => ({ label: cap, picked: capabilities.includes(cap) })),
        {
            placeHolder: 'Select capabilities to use',
            canPickMany: true,
        }
    )

    return selected ? selected.map((item) => item.label) : undefined
}

export async function shouldImportResources(): Promise<boolean> {
    const choice = await window.showQuickPick(['Deploy new/updated resources', 'Import existing resources'], {
        placeHolder: 'Select deployment mode',
        ignoreFocusOut: true,
    })

    return choice === 'Import existing resources'
}

export async function getResourcesToImport(
    templateResources: TemplateResource[]
): Promise<ResourceToImport[] | undefined> {
    const resourcesToImport: ResourceToImport[] = []

    const selectedResources = await window.showQuickPick(
        templateResources.map((r) => ({
            label: r.logicalId,
            description: r.type,
            picked: false,
            resource: r,
        })),
        {
            placeHolder: 'Select resources to import',
            canPickMany: true,
            ignoreFocusOut: true,
        }
    )

    if (!selectedResources || selectedResources.length === 0) {
        return undefined
    }

    for (const selected of selectedResources) {
        const resourceIdentifier = await getResourceIdentifier(
            selected.resource.logicalId,
            selected.resource.type,
            selected.resource.primaryIdentifierKeys,
            selected.resource.primaryIdentifier
        )

        if (!resourceIdentifier) {
            return undefined
        }

        resourcesToImport.push({
            ResourceType: selected.resource.type,
            LogicalResourceId: selected.resource.logicalId,
            ResourceIdentifier: resourceIdentifier,
        })
    }

    return resourcesToImport
}

async function getResourceIdentifier(
    logicalId: string,
    resourceType: string,
    primaryIdentifierKeys?: string[],
    primaryIdentifier?: Record<string, string>
): Promise<Record<string, string> | undefined> {
    if (!primaryIdentifierKeys || primaryIdentifierKeys.length === 0) {
        void window.showErrorMessage(`No primary identifier keys found for ${resourceType}`)
        return undefined
    }

    if (primaryIdentifier && Object.keys(primaryIdentifier).length > 0) {
        const id = Object.values(primaryIdentifier).join('|')

        const usePrimary = await window.showQuickPick([id, 'Enter manually'], {
            placeHolder: `Select primary identifier for ${logicalId}`,
            ignoreFocusOut: true,
        })
        if (!usePrimary) {
            return undefined
        }
        if (usePrimary === id) {
            return primaryIdentifier
        }
    }

    const identifiers: Record<string, string> = {}

    for (const key of primaryIdentifierKeys) {
        const value = await window.showInputBox({
            prompt: `Enter ${key} for ${logicalId} (${resourceType})`,
            placeHolder: `Physical ${key} of existing resource`,
            ignoreFocusOut: true,
        })

        if (!value) {
            return undefined
        }

        identifiers[key] = value
    }

    return identifiers
}

export async function getProjectName(prefillValue: string | undefined) {
    return await window.showInputBox({
        prompt: 'Enter project name',
        value: prefillValue,
        validateInput: (v) => {
            if (!v.trim()) {
                return 'Required'
            }
            if (!/^[a-zA-Z0-9_-]{1,64}$/.test(v.trim())) {
                return 'Must be 1-64 characters, alphanumeric with hyphens and underscores only'
            }
            return undefined
        },
    })
}

export async function getProjectPath(prefillValue: string) {
    return await window.showInputBox({
        prompt: 'Enter project path (optional)',
        value: prefillValue,
        placeHolder: 'Press Enter for current directory',
        validateInput: (v) => {
            if (!v.trim()) {
                return undefined
            } // Optional field

            try {
                const resolvedPath = path.resolve(v.trim())
                const parentDir = path.dirname(resolvedPath)

                if (!fs.existsDir(parentDir)) {
                    return 'Parent directory does not exist'
                }

                return undefined
            } catch (error) {
                return 'Invalid path format'
            }
        },
    })
}

export async function getEnvironmentName() {
    return await window.showInputBox({
        prompt: 'Environment name',
        validateInput: (v) => {
            if (!v.trim()) {
                return 'Required'
            }
            if (!/^[a-zA-Z0-9_-]{1,32}$/.test(v.trim())) {
                return 'Must be 1-32 characters, alphanumeric with hyphens and underscores only'
            }
            return undefined
        },
    })
}
