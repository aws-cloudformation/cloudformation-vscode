import * as fs from 'fs';
import { StackActionParameter } from './StackActionRequestType';

export function validateTemplatePath(value: string): string | null {
    if (!value) {
        return 'Template path is required';
    }

    const filePath = value.startsWith('file://') ? value.slice(7) : value;
    if (!fs.existsSync(filePath)) {
        return 'Template file does not exist';
    }

    const validExtensions = ['.yaml', '.json', '.yml', '.txt', '.cfn', '.template'];
    if (!validExtensions.some((ext) => filePath.endsWith(ext))) {
        return 'Invalid template file extension';
    }

    return null;
}

export function validateStackName(value: string): string | null {
    if (!value) {
        return 'Stack name is required';
    }

    if (value.length > 128) {
        return 'Stack name must be 128 characters or less';
    }

    if (!/^[a-zA-Z][-a-zA-Z0-9]*$/.test(value)) {
        return 'Stack name must start with a letter and contain only alphanumeric characters and hyphens';
    }

    return null;
}

export function validateParameterValue(input: string, param: StackActionParameter): string | null {
    if (!input && !param.Default) {
        return `Parameter ${param.name} is required`;
    }

    const actualValue = input ?? param.Default?.toString() ?? '';

    if (param.AllowedValues && !param.AllowedValues.includes(actualValue)) {
        return `Value must be one of: ${param.AllowedValues.join(', ')}`;
    }

    if (param.AllowedPattern && !new RegExp(param.AllowedPattern).test(actualValue)) {
        return `Value must match pattern: ${param.AllowedPattern}`;
    }

    if (param.MinLength && actualValue.length < param.MinLength) {
        return `Value must be at least ${param.MinLength} characters`;
    }

    if (param.MaxLength && actualValue.length > param.MaxLength) {
        return `Value must be at most ${param.MaxLength} characters`;
    }

    if (param.Type === 'Number') {
        const numValue = Number(actualValue);
        if (isNaN(numValue)) {
            return 'Value must be a number';
        }
        if (param.MinValue && numValue < param.MinValue) {
            return `Value must be at least ${param.MinValue}`;
        }
        if (param.MaxValue && numValue > param.MaxValue) {
            return `Value must be at most ${param.MaxValue}`;
        }
    }

    return null;
}
