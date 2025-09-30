import { ExtensionConfigKey, ExtensionId } from './ExtensionConfig';

export function toString(object: unknown): string {
    return JSON.stringify(object);
}

export function isDevelopment() {
    return process.env.AWS_ENV === 'alpha';
}

export function formatMessage(message: string): string {
    return `${ExtensionId}: ${message}`;
}

export function commandKey(key: string): string {
    return `${ExtensionConfigKey}.${key}`;
}
