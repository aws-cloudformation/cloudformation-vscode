import { window, workspace, Uri } from 'vscode';
import { validateStackName, validateParameterValue } from '../cfn/InputValidationUtil';
import { Parameter } from '@aws-sdk/client-cloudformation';
import { TemplateParameter } from '../cfn/TemplateRequestType';
import { DocumentManager } from '../documents/DocumentManager';

export async function getTemplatePath(documentManager: DocumentManager): Promise<string | undefined> {
    const validTemplates = documentManager
        .get()
        .filter((doc) => doc.cfnType === 'template')
        .map((doc) => {
            const uri = doc.uri;

            return {
                label: doc.fileName,
                description: workspace.asRelativePath(Uri.parse(uri)),
                uri: uri,
            };
        })
        .sort((a, b) => a.label.localeCompare(b.label));

    const selected = await window.showQuickPick(validTemplates, {
        placeHolder: 'Select CloudFormation template',
        ignoreFocusOut: true,
    });

    if (!selected) return undefined;

    return selected.uri;
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
