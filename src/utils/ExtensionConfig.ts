import Pkg from '../../package.json';

export const ExtensionId = Pkg.id;
export const ExtensionName = Pkg.displayName;
export const ExtensionVersion = Pkg.version;
export const ExtensionConfigKey = 'aws.cloudformation';

export type BuildEnvironment = 'alpha' | 'beta' | 'prod';

const validEnvironments = new Set<string>(['alpha', 'beta', 'prod']);

export function environment(): BuildEnvironment {
    const env = process.env.AWS_ENV;
    if (!env || !validEnvironments.has(env)) {
        throw new Error(`AWS_ENV must be one of alpha, beta, prod — got '${String(env)}'`);
    }
    return env as BuildEnvironment;
}

export function commandKey(key: string): string {
    return `${ExtensionId}.${key}`;
}
