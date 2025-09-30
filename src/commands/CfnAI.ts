import { ExecuteCommandRequest } from 'vscode-languageclient';
import { ViewColumn, window } from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
import { toString } from '../utils';
import { htmlPreview } from '../ui/htmlPreview';
import { docPreview } from '../documents/DocumentPreview';
import { DocumentMetadata } from '../documents/DocumentManager';

export async function describe(client: LanguageClient, documents: () => DocumentMetadata[], fileName?: string) {
    const file =
        fileName ??
        (await window.showQuickPick(
            documents().map((file) => file.fileName),
            {
                placeHolder: 'Select a CloudFormation template',
                canPickMany: false,
            },
        ));

    if (file !== undefined) {
        await client
            .sendRequest(ExecuteCommandRequest.method, {
                command: '/command/llm/template/describe',
                arguments: [file],
            })
            .then((result) => {
                return htmlPreview(result, `AI Overview: Describe ${file}`);
            })
            .catch((error) => {
                window.showErrorMessage(toString(error));
            });
    }
}

export async function optimize(client: LanguageClient, documents: () => DocumentMetadata[], fileName?: string) {
    const file =
        fileName ??
        (await window.showQuickPick(
            documents().map((file) => file.fileName),
            {
                placeHolder: 'Select a CloudFormation template',
                canPickMany: false,
            },
        ));

    if (file !== undefined) {
        await client
            .sendRequest(ExecuteCommandRequest.method, {
                command: '/command/llm/template/optimize',
                arguments: [file],
            })
            .then((result) => {
                return htmlPreview(result, `AI Overview: Optimize ${file}`);
            })
            .catch((error) => {
                window.showErrorMessage(toString(error));
            });
    }
}

export async function generate(client: LanguageClient) {
    const prompt = await window.showInputBox({
        prompt: 'Describe your business requirements',
    });

    if (prompt !== undefined) {
        await client
            .sendRequest(ExecuteCommandRequest.method, {
                command: '/command/llm/template/generate',
                arguments: [prompt],
            })
            .then((result) => {
                return docPreview({
                    content: result as string,
                    language: 'yaml',
                    viewColumn: ViewColumn.Beside,
                    preserveFocus: true,
                });
            })
            .catch((error) => {
                window.showErrorMessage(toString(error));
            });
    }
}

export async function recommendRelatedResources(
    client: LanguageClient,
    documents: () => DocumentMetadata[],
    fileName?: string,
) {
    const file =
        fileName ??
        (await window.showQuickPick(
            documents().map((file) => file.fileName),
            {
                placeHolder: 'Select a CloudFormation template',
                canPickMany: false,
            },
        ));

    if (file !== undefined) {
        await client
            .sendRequest(ExecuteCommandRequest.method, {
                command: '/command/llm/template/recommend-related',
                arguments: [file],
            })
            .then((result) => {
                return htmlPreview(result, `AI Overview: Recommend Related Resources for ${file}`);
            })
            .catch((error) => {
                window.showErrorMessage(toString(error));
            });
    }
}
