import { prettyPrint } from '@base2/pretty-print-object';
import { ExtensionName } from './ExtensionConfig';

export function toString(value: unknown, indent = '\t'.repeat(1)) {
    if (value === null || !['object', 'function'].includes(typeof value)) {
        return String(value);
    }

    return prettyPrint(value, {
        indent,
        inlineCharacterLimit: 50,
    });
}

export function formatMessage(message: string): string {
    return `${ExtensionName}: ${message}`;
}

export function extractErrorMessage(error: unknown) {
    if (error instanceof Error) {
        const prefix = error.name === 'Error' ? '' : `${error.name}: `;
        return `${prefix}${error.message}`;
    }

    return toString(error);
}
