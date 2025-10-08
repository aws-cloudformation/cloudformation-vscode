import { ExtensionConfigKey, ExtensionId } from './ExtensionConfig';
import { Position } from 'vscode';

export function toString(value: unknown): string {
    if (value === null || !['object', 'function'].includes(typeof value)) {
        return String(value);
    }

    return JSON.stringify(value);
}

export function isDevelopment() {
    return process.env.NODE_ENV !== 'production';
}

export function formatMessage(message: string): string {
    return `${ExtensionId}: ${message}`;
}

export function commandKey(key: string): string {
    return `${ExtensionConfigKey}.${key}`;
}

/**
 * Finds the position of the parameter description value where the cursor should be placed.
 * Returns the position between the quotes of the Description property.
 */
export function findParameterDescriptionPosition(
    text: string,
    parameterName: string,
    documentType: string,
): Position | undefined {
    const lines = text.split('\n');

    if (documentType === 'JSON') {
        return findJsonParameterDescriptionPosition(lines, parameterName);
    } else {
        return findYamlParameterDescriptionPosition(lines, parameterName);
    }
}

/**
 * Finds the description position in JSON format.
 * Looks for: "ParameterName": { ... "Description": "HERE" ... }
 */
function findJsonParameterDescriptionPosition(lines: string[], parameterName: string): Position | undefined {
    let inParameter = false;
    const parameterPattern = new RegExp(`^\\s*"${escapeRegex(parameterName)}"\\s*:\\s*\\{`);

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (!inParameter && parameterPattern.test(line)) {
            inParameter = true;
            continue;
        }

        if (inParameter) {
            // Look for the Description property
            const descriptionMatch = line.match(/^(\s*)"Description"\s*:\s*"([^"]*)"/);
            if (descriptionMatch) {
                const indentation = descriptionMatch[1];
                const descriptionValue = descriptionMatch[2];
                // Position cursor between the quotes, after any existing description text
                const character = indentation.length + '"Description": "'.length + descriptionValue.length;
                return new Position(i, character);
            }

            // Check if we've reached the end of this parameter
            if (line.match(/^\s*\}/)) {
                break;
            }
        }
    }

    return undefined;
}

/**
 * Finds the description position in YAML format.
 * Looks for: ParameterName: ... Description: "HERE" ...
 */
function findYamlParameterDescriptionPosition(lines: string[], parameterName: string): Position | undefined {
    let inParameter = false;
    const parameterPattern = new RegExp(`^\\s*${escapeRegex(parameterName)}\\s*:`);

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (!inParameter && parameterPattern.test(line)) {
            inParameter = true;
            continue;
        }

        if (inParameter) {
            // Look for the Description property
            const descriptionMatch = line.match(/^(\s*)Description\s*:\s*(['"]?)([^'"]*)\2/);
            if (descriptionMatch) {
                const indentation = descriptionMatch[1];
                const quote = descriptionMatch[2];
                const descriptionValue = descriptionMatch[3];
                // Position cursor between the quotes, after any existing description text
                const character = indentation.length + 'Description: '.length + quote.length + descriptionValue.length;
                return new Position(i, character);
            }

            // Check if we've reached the end of this parameter (next parameter or section)
            if (line.match(/^\s*\w+\s*:/) && !line.match(/^\s*(Type|Default|Description|AllowedValues)\s*:/)) {
                break;
            }
        }
    }

    return undefined;
}

/**
 * Escapes special regex characters in a string.
 */
function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
