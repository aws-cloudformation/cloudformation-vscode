import { window, workspace, TabInputText } from 'vscode';
import { validateTemplatePath, validateStackName, validateParameterValue } from '../cfn/InputValidationUtil';
import { Parameter } from '@aws-sdk/client-cloudformation';
import { TemplateParameter } from '../cfn/TemplateRequestType';

export async function getTemplatePath(prefill?: string): Promise<string | undefined> {
    const openFiles = window.tabGroups.all
        .flatMap((group) => group.tabs)
        .filter((tab) => tab.input instanceof TabInputText && tab.input.uri.scheme === 'file')
        .map((tab) => {
            const input = tab.input as TabInputText;
            return {
                label: workspace.asRelativePath(input.uri),
                description: input.uri.fsPath,
                uri: input.uri.toString(),
            };
        })
        .filter((item) => item.uri.startsWith('file://'));

    if (openFiles.length > 0) {
        const items = [
            ...openFiles,
            { label: '$(file) Select file...', description: 'Browse for file', uri: 'SELECT_FILE' },
        ];

        const selected = await window.showQuickPick(items, {
            placeHolder: 'Select CloudFormation template',
            ignoreFocusOut: true,
        });

        if (!selected) return undefined;

        if (selected.uri === 'SELECT_FILE') {
            const fileUri = await window.showOpenDialog({
                canSelectFiles: true,
                canSelectFolders: false,
                canSelectMany: false,
                filters: {
                    CloudFormation: ['json', 'yaml', 'yml', 'template', 'cfn', 'txt'],
                },
            });
            return fileUri?.[0]?.toString();
        }

        return selected.uri;
    }

    const templatePath = await window.showInputBox({
        prompt: 'Enter the CloudFormation template path',
        value: prefill,
        validateInput: validateTemplatePath,
        ignoreFocusOut: true,
    });

    if (templatePath) {
        return templatePath.startsWith('file://') ? templatePath : `file://${templatePath}`;
    }
    return undefined;
}

export async function getStackName(prefill?: string): Promise<string | undefined> {
    return await window.showInputBox({
        prompt: 'Enter the CloudFormation stack name',
        value: prefill,
        validateInput: validateStackName,
        ignoreFocusOut: true,
    });
}

export async function getParameterValues(
    templateParameters: TemplateParameter[],
    prefillParameters?: Parameter[],
): Promise<Parameter[] | undefined> {
    const parameters: Parameter[] = [];

    for (const param of templateParameters) {
        const prefillValue = prefillParameters?.find((p) => p.ParameterKey === param.name)?.ParameterValue;
        const value = await getParameterValue(param, prefillValue);
        if (value) {
            parameters.push(value);
        }
    }

    return parameters;
}

async function getParameterValue(parameter: TemplateParameter, prefill?: string): Promise<Parameter | undefined> {
    const prompt = `Enter value for parameter "${parameter.name}"${parameter.Description ? ` - ${parameter.Description}` : ''}`;
    const placeHolder = parameter.Default ? `Default: ${parameter.Default}` : (parameter.Type ?? 'String');
    const allowedInfo = parameter.AllowedValues ? ` (Allowed: ${parameter.AllowedValues.join(', ')})` : '';

    const value = await window.showInputBox({
        prompt: prompt + allowedInfo,
        placeHolder,
        value: prefill ?? parameter.Default?.toString(),
        validateInput: (input: string) => validateParameterValue(input, parameter),
        ignoreFocusOut: true,
    });

    if (value === undefined) {
        return undefined;
    }

    return { ParameterKey: parameter.name, ParameterValue: value };
}
