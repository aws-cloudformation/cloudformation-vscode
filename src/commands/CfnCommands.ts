import { commands, env, Uri, window, workspace } from 'vscode';
import { commandKey } from '../utils';
import { LanguageClient } from 'vscode-languageclient/node';
import { Command } from 'vscode-languageclient';
import { Deployment, setLastDeployment } from '../stacks/actions/DeploymentWorkflow';
import { Parameter } from '@aws-sdk/client-cloudformation';
import { getParameterValues, getStackName, getTemplatePath, confirmCapabilities } from '../ui/InputBox';
import { showErrorMessage } from '../ui/Message';
import { getLastValidation, setLastValidation, Validation } from '../stacks/actions/ValidationWorkflow';
import { getParameters, getCapabilities } from '../stacks/actions/StackActionApi';
import { TemplateParameter } from '../stacks/actions/StackActionRequestType';
import { StacksManager } from '../stacks/StacksManager';
import { ResourceNode } from '../treeview/nodes/ResourceNode';
import { ResourcesManager } from '../resources/ResourcesManager';
import { DocumentManager } from '../documents/DocumentManager';

import { DiffWebviewProvider } from '../ui/DiffWebviewProvider';
import { ResourceContextValue } from '../treeview/ContextValue';

export function validateTemplateCommand(
    client: LanguageClient,
    stacks: StacksManager,
    diffProvider: DiffWebviewProvider,
    documentManager: DocumentManager,
) {
    return commands.registerCommand(commandKey('api.validateTemplate'), async (templateUri?: string) => {
        try {
            templateUri ??= await getTemplatePath(documentManager);
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

            const capabilitiesResult = await getCapabilities(client, templateUri);
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
    return commands.registerCommand(commandKey('api.deployTemplate'), async (templateUri?: string) => {
        try {
            templateUri ??= await getTemplatePath(documentManager);
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

            const capabilitiesResult = await getCapabilities(client, templateUri);
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
        const result = await getParameters(client, templateUri);
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
    const handler = async (node: ResourceNode, selectedNodes?: ResourceNode[]) => {
        const nodes = selectedNodes ?? (node ? [node] : []);
        const resourceNodes = nodes.filter((n) => n.contextValue === ResourceContextValue);
        await resourcesManager.importResourceStates(resourceNodes);
    };

    return [
        commands.registerCommand(commandKey('api.importResourceState'), handler),
        commands.registerCommand(commandKey('api.importResourceState.palette'), () => handler({} as ResourceNode)),
    ];
}

export function cloneResourceStateCommand(resourcesManager: ResourcesManager) {
    const handler = async (node: ResourceNode, selectedNodes?: ResourceNode[]) => {
        const nodes = selectedNodes ?? (node ? [node] : []);
        const resourceNodes = nodes.filter((n) => n.contextValue === ResourceContextValue);
        await resourcesManager.cloneResourceStates(resourceNodes);
    };

    return [
        commands.registerCommand(commandKey('api.cloneResourceState'), handler),
        commands.registerCommand(commandKey('api.cloneResourceState.palette'), () => handler({} as ResourceNode)),
    ];
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

export function getStackManagementInfoCommand(resourcesManager: ResourcesManager) {
    return commands.registerCommand(commandKey('api.getStackManagementInfo'), async (resourceNode?: ResourceNode) => {
        await resourcesManager.getStackManagementInfo(resourceNode);
    });
}

export function getStackManagementInfoCommandPalette(resourcesManager: ResourcesManager) {
    return commands.registerCommand(commandKey('api.getStackManagementInfo.palette'), async () => {
        await resourcesManager.getStackManagementInfo();
    });
}
