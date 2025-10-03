import { commands, window, Uri } from 'vscode';
import { commandKey, formatMessage, toString } from '../utils';
import { LanguageClient } from 'vscode-languageclient/node';
import { AwsCredentialsService } from '../auth/awsCredentials';
import { DocumentManager, DocumentMetadata } from '../documents/DocumentManager';
import { describe, generate, optimize, recommendRelatedResources as recommendRelatedResourcesCommand } from './CfnAI';

export function describeTemplate(client: LanguageClient, documents: () => DocumentMetadata[]) {
    return commands.registerCommand(commandKey('llm.template.describe'), async () => {
        await describe(client, documents);
    });
}

export function optimizeTemplate(client: LanguageClient, documents: () => DocumentMetadata[]) {
    return commands.registerCommand(commandKey('llm.template.optimize'), async () => {
        await optimize(client, documents);
    });
}

export function generateTemplate(client: LanguageClient) {
    return commands.registerCommand(commandKey('llm.template.generate'), async () => {
        await generate(client);
    });
}

export function recommendRelatedResources(client: LanguageClient, documents: () => DocumentMetadata[]) {
    return commands.registerCommand(commandKey('llm.template.recommendRelatedResources'), async () => {
        await recommendRelatedResourcesCommand(client, documents);
    });
}

export function restartCommand(client: LanguageClient) {
    return commands.registerCommand(commandKey('server.restartServer'), async () => {
        try {
            if (client) {
                await client.stop();
                await client.start();
            }
        } catch (error) {
            window.showErrorMessage(formatMessage(`Failed to restart server: ${toString(error)}`));
        }
    });
}

export function selectProfileCommand(awsCredentialsService: AwsCredentialsService) {
    return commands.registerCommand(commandKey('auth.selectAwsProfile'), async () => {
        try {
            await awsCredentialsService.promptForProfileSelection();
        } catch (error) {
            window.showErrorMessage(
                formatMessage(
                    `Error selecting AWS profile ${error instanceof Error ? error.message : toString(error)}`,
                ),
            );
        }
    });
}

export function aiButtonCommand(client: LanguageClient, documentManager: DocumentManager) {
    return commands.registerCommand(commandKey('ai.showMenu'), async (uri?: Uri) => {
        const activeEditor = window.activeTextEditor;
        if (!activeEditor) {
            return;
        }

        const currentUri = uri ?? activeEditor.document.uri;
        const document = documentManager.get().find((doc) => doc.uri === currentUri.toString());

        if (document?.cfnType !== 'template') {
            return;
        }

        const options = [
            { label: 'Describe Template', command: 'describe' },
            { label: 'Optimize Template', command: 'optimize' },
            { label: 'Recommend Related Resources', command: 'recommendRelated' },
            { label: 'Generate Template', command: 'generate' },
        ];

        const selected = await window.showQuickPick(options, {
            placeHolder: 'Select AI action for CloudFormation template',
        });

        if (selected) {
            if (selected.command === 'describe') {
                await describe(
                    client,
                    () => {
                        return documentManager.get();
                    },
                    document.fileName,
                );
            } else if (selected.command === 'optimize') {
                await optimize(
                    client,
                    () => {
                        return documentManager.get();
                    },
                    document.fileName,
                );
            } else if (selected.command === 'recommendRelated') {
                await recommendRelatedResourcesCommand(
                    client,
                    () => {
                        return documentManager.get();
                    },
                    document.fileName,
                );
            } else if (selected.command === 'generate') {
                await generate(client);
            }
        }
    });
}
