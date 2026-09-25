import Pkg from '../../package.json';

export const ExtensionId = Pkg.id;
export const ExtensionName = Pkg.displayName;
export const ExtensionVersion = Pkg.version;
export const ExtensionConfigKey = 'aws.cloudformation';

/**
 * Client key identifying this IDE client to the CloudFormation LSP.
 */
export const CfnLspClientName = 'cloudformation-vscode';

export type BuildEnvironment = 'alpha' | 'beta' | 'prod';

const validEnvironments = new Set<string>(['alpha', 'beta', 'prod']);

/**
 * Resolves the effective build environment/channel.
 * Priority: CFN_LSP_ENVIRONMENT override > AWS_ENV > default 'prod'.
 */
export function environment(): BuildEnvironment {
    const override = process.env.CFN_LSP_ENVIRONMENT?.trim().toLowerCase();
    if (override && validEnvironments.has(override)) {
        return override as BuildEnvironment;
    }

    const env = process.env.AWS_ENV?.toLowerCase();
    if (env && validEnvironments.has(env)) {
        return env as BuildEnvironment;
    }

    // Default to prod when neither env variable is set
    return 'prod';
}

export function commandKey(key: string): string {
    return `${ExtensionId}.${key}`;
}
