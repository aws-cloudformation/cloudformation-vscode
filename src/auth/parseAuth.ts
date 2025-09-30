import { parse } from 'ini';
import { promises, constants } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export type Credential = {
    data: {
        profile?: string;
        accessKeyId?: string;
        secretAccessKey?: string;
        sessionToken?: string;
        region?: string;
    };
    encrypted: boolean;
};

export type ProfileConfig = {
    name: string;
    region?: string;
    credentialProcess?: string;
    credential?: {
        accessKeyId: string;
        secretAccessKey: string;
        sessionToken?: string;
    };
    hasCredentials: boolean;
    [key: string]: unknown;
};

async function readIniFile(path: string): Promise<Record<string, Record<string, string>>> {
    try {
        await promises.access(path, constants.R_OK);
        return parse(await promises.readFile(path, 'utf8'));
    } catch (error) {
        console.warn(`Failed to load file: ${path}`, error);
    }

    return {};
}

export async function loadCredentialsFile(): Promise<Record<string, Record<string, string>>> {
    try {
        return await readIniFile(join(homedir(), '.aws', 'credentials'));
    } catch (error) {
        return {};
    }
}

export async function loadConfigFile(): Promise<Record<string, Record<string, string>>> {
    try {
        const parsed = await readIniFile(join(homedir(), '.aws', 'config'));
        const normalized: Record<string, Record<string, string>> = {};

        for (const [key, value] of Object.entries(parsed)) {
            if (key === 'default') {
                normalized['default'] = value;
            } else if (key.startsWith('profile ')) {
                normalized[key.replaceAll('profile ', '')] = value;
            }
        }

        return normalized;
    } catch (error) {
        return {};
    }
}

export function buildProfileInfo(
    profile: string,
    credentials: Record<string, string>,
    config: Record<string, string>,
    defaultCredentials: Record<string, string>,
    defaultConfig: Record<string, string>,
): ProfileConfig {
    // Remove credential_process from default credentials and config to prevent inheritance
    const filteredDefaultCredentials = { ...defaultCredentials };
    delete filteredDefaultCredentials.credential_process;

    const filteredDefaultConfig = { ...defaultConfig };
    delete filteredDefaultConfig.credential_process;

    // Merge configs (config file takes precedence for most settings)
    const merged = { ...filteredDefaultCredentials, ...credentials, ...filteredDefaultConfig, ...config };
    const staticCredentials =
        merged.aws_access_key_id && merged.aws_secret_access_key
            ? {
                  accessKeyId: merged.aws_access_key_id,
                  secretAccessKey: merged.aws_secret_access_key,
                  sessionToken: merged.aws_session_token,
              }
            : undefined;
    const credProcess = merged.credential_process;

    return {
        name: profile,
        region: merged.region,
        credential: staticCredentials,
        credentialProcess: credProcess,
        hasCredentials: staticCredentials !== undefined || credProcess !== undefined,
    };
}

export function credentialFromData(
    profile?: string,
    accessKeyId?: string,
    secretAccessKey?: string,
    sessionToken?: string,
    region?: string,
): Credential {
    return {
        encrypted: false,
        data: {
            profile,
            accessKeyId,
            secretAccessKey,
            sessionToken,
            region,
        },
    };
}
