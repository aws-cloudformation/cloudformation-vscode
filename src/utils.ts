import { ExtensionConfigKey, ExtensionId } from './ExtensionConfig';

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
