import { commands, env, Uri, window, workspace } from 'vscode';
import { commandKey } from '../utils';
import { LanguageClient } from 'vscode-languageclient/node';
import { Command } from 'vscode-languageclient';
import { Deployment, setLastDeployment } from '../cfn/Deployment';
import { Parameter } from '@aws-sdk/client-cloudformation';
import { getParameterValues, getStackName, getTemplatePath, confirmCapabilities } from '../ui/InputBox';
import { showErrorMessage } from '../ui/Message';
import { getLastValidation, setLastValidation, Validation } from '../cfn/Validation';
import { getParameters, getCapabilities } from '../cfn/TemplateAPIs';
import { TemplateParameter } from '../cfn/TemplateRequestType';
import { StacksManager } from '../stacks/StacksManager';
import { ResourceNode } from '../treeview/nodes/ResourceNode';
import { ResourcesManager } from '../resources/ResourcesManager';
import { DocumentManager } from '../documents/DocumentManager';

import { DiffWebviewProvider } from '../ui/DiffWebviewProvider';

export function validateTemplateCommand(
    client: LanguageClient,
    stacks: StacksManager,
    diffProvider: DiffWebviewProvider,
    documentManager: DocumentManager,
) {
    return commands.registerCommand(commandKey('api.validateTemplate'), async () => {
        try {
            const templateUri = await getTemplatePath(documentManager);
            if (!templateUri) return;

            await ensureFileIsOpen(templateUri);

            const stackName = await getStackName(getLastValidation()?.stackName);
            if (!stackName) return;

            const paramDefinition = await getTemplateParameters(client, templateUri);

            let parameters: Parameter[] | undefined;
            if (paramDefinition.length > 0) {
                parameters = await getParameterValues(paramDefinition, getLastValidation()?.parameters);
            }
            if (paramDefinition.length > 0 && !parameters) return;

            const capabilitiesResult = await getCapabilities(client, { uri: templateUri });
            const capabilities = await confirmCapabilities(capabilitiesResult.capabilities);
            if (capabilities === undefined) return; // User cancelled

            const validation = new Validation(templateUri, stackName, client, diffProvider, parameters, capabilities);

            setLastValidation(validation);

            await validation.validate();
            stacks.startPolling();
        } catch (error) {
            showErrorMessage(
                `Client: Error validating template: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
    });
}

export function deployTemplateCommand(client: LanguageClient, stacks: StacksManager, documentManager: DocumentManager) {
    return commands.registerCommand(commandKey('api.deployTemplate'), async () => {
        try {
            const templateUri = await getTemplatePath(documentManager);
            if (!templateUri) return;

            await ensureFileIsOpen(templateUri);

            const stackName = await getStackName();
            if (!stackName) return;

            const paramDefinition = await getTemplateParameters(client, templateUri);

            let parameters: Parameter[] | undefined;
            if (paramDefinition.length > 0) {
                parameters = await getParameterValues(paramDefinition);
            }
            if (paramDefinition.length > 0 && !parameters) return;

            const capabilitiesResult = await getCapabilities(client, { uri: templateUri });
            const capabilities = await confirmCapabilities(capabilitiesResult.capabilities);
            if (capabilities === undefined) return; // User cancelled

            const deployment = new Deployment(templateUri, stackName, client, parameters, capabilities);
            setLastDeployment(deployment);
            await deployment.deploy();
            stacks.startPolling();
        } catch (error) {
            showErrorMessage(`Error deploying template: ${error instanceof Error ? error.message : String(error)}`);
        }
    });
}

export function rerunLastValidationCommand() {
    return commands.registerCommand(commandKey('api.rerunLastValidation'), async () => {
        try {
            const lastValidation = getLastValidation();
            if (!lastValidation) {
                showErrorMessage('No previous validation to rerun');
                return;
            }
            await lastValidation.validate();
        } catch (error) {
            showErrorMessage(`Error rerunning validation: ${error instanceof Error ? error.message : String(error)}`);
        }
    });
}

async function ensureFileIsOpen(templateUri: string): Promise<void> {
    const uri = Uri.parse(templateUri);
    const openEditors = window.visibleTextEditors;
    const isFileOpen = openEditors.some((editor) => editor.document.uri.toString() === uri.toString());

    if (!isFileOpen) {
        try {
            const document = await workspace.openTextDocument(uri);
            await window.showTextDocument(document);
        } catch (error) {
            console.warn('Could not open file:', error);
            throw error;
        }
    }
}

async function getTemplateParameters(client: LanguageClient, templateUri: string): Promise<TemplateParameter[]> {
    try {
        const result = await getParameters(client, { uri: templateUri });
        return result.parameters;
    } catch (error) {
        showErrorMessage(
            `Error getting template parameters: ${error instanceof Error ? error.message : String(error)}`,
        );
        return [];
    }
}

export const SelectResourceTypeCommand: Command = {
    title: 'Select Resource Types',
    command: commandKey('api.selectResourceTypes'),
    arguments: [],
};

export function selectResourceTypesCommand(resourcesManager: ResourcesManager) {
    return commands.registerCommand(
        commandKey('api.selectResourceTypes'),
        async () => await resourcesManager.selectResourceTypes(),
    );
}

export function addResourceTypesCommand(resourcesManager: ResourcesManager) {
    return commands.registerCommand(
        commandKey('api.addResourceTypes'),
        async () => await resourcesManager.selectResourceTypes(),
    );
}

export function importResourceStateCommand(resourcesManager: ResourcesManager) {
    return commands.registerCommand(commandKey('api.importResourceState'), async (resourceNode?: ResourceNode) => {
        await resourcesManager.importResourceStates(resourceNode);
    });
}

export function cloneResourceStateCommand(resourcesManager: ResourcesManager) {
    return commands.registerCommand(commandKey('api.cloneResourceState'), async (resourceNode?: ResourceNode) => {
        await resourcesManager.cloneResourceStates(resourceNode);
    });
}

export const RefreshResourceListCommand: Command = {
    title: 'Refresh Resource List',
    command: commandKey('api.refreshResourceList'),
    arguments: [],
};

export function copyResourceIdentifierCommand() {
    return commands.registerCommand(commandKey('api.copyResourceIdentifier'), async (resourceNode?: ResourceNode) => {
        if (resourceNode?.resourceIdentifier) {
            await env.clipboard.writeText(resourceNode.resourceIdentifier);
            window.setStatusBarMessage(`Resource identifier copied to clipboard`, 3000);
        }
    });
}

export function refreshAllResourcesCommand(resourcesManager: ResourcesManager) {
    return commands.registerCommand(commandKey('api.refreshAllResources'), () => {
        resourcesManager.refreshAllResources();
    });
}

export function refreshResourceListCommand(resourcesManager: ResourcesManager) {
    return commands.registerCommand(commandKey('api.refreshResourceList'), (resourceNode?: ResourceNode) => {
        const resourceType = resourceNode?.resourceList?.typeName;
        if (resourceType) {
            resourcesManager.refreshResourceList(resourceType);
        }
    });
}

export function viewStackDiffCommand() {
    return commands.registerCommand(commandKey('stacks.viewDiff'), () => {
        commands.executeCommand('setContext', 'cloudformationDiffVisible', true);
        commands.executeCommand('aws.cloudformation.diff.focus');
    });
}

export function focusDiffCommand() {
    return commands.registerCommand(commandKey('diff.focus'), () => {
        commands.executeCommand('workbench.view.extension.cfn-diff');
    });
}
