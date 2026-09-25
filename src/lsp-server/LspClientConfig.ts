import { randomBytes } from 'crypto';
import { dirname } from 'path';
import { ServerOptions, TextDocumentFilter, TransportKind } from 'vscode-languageclient/node';
import { CfnLspClientName, ExtensionVersion } from '../utils/ExtensionConfig';

export const CfnDocumentSelector: TextDocumentFilter[] = [
    { scheme: 'file', language: 'plaintext' },
    { scheme: 'file', language: 'cloudformation' },
    { scheme: 'file', language: 'template' },
    { scheme: 'file', language: 'json' },
    { scheme: 'file', language: 'yaml' },
    { scheme: 'file', pattern: '**/*.txt' },
    { scheme: 'file', pattern: '**/*.template' },
    { scheme: 'file', pattern: '**/*.cfn' },
    { scheme: 'file', pattern: '**/*.json' },
    { scheme: 'file', pattern: '**/*.yaml' },
    { scheme: 'file', pattern: '**/*.yml' },
];

const serverEnvironment = { NODE_OPTIONS: '--enable-source-maps' };

const encryptionKey = randomBytes(32);

export function cfnServerOptions(serverPath: string): ServerOptions {
    const serverDirectory = dirname(serverPath);
    return {
        run: {
            module: serverPath,
            transport: TransportKind.ipc,
            options: { cwd: serverDirectory, env: serverEnvironment },
        },
        debug: {
            module: serverPath,
            transport: TransportKind.ipc,
            options: { cwd: serverDirectory, execArgv: ['--no-lazy'], env: serverEnvironment },
        },
    };
}

export function cfnInitializationOptions(telemetryEnabled: boolean, clientId: string | undefined) {
    return {
        handledSchemaProtocols: ['file'],
        aws: {
            clientInfo: {
                extension: {
                    name: CfnLspClientName,
                    version: ExtensionVersion,
                },
                clientId,
            },
            commandSuffix: CfnLspClientName,
            telemetryEnabled,
            encryption: {
                key: encryptionKey.toString('base64'),
                mode: 'JWT',
            },
        },
    };
}
