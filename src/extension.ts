import { randomBytes } from 'crypto';
import { ExtensionContext, languages, window } from 'vscode';
import {
    CloseAction,
    ErrorAction,
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind,
} from 'vscode-languageclient/node';
import { AwsCredentialsService } from './auth/AwsCredentials';
import { restartCommand, updateRegion } from './commands/Commands';
import { CfnInlineCompletionProvider } from './inlineCompletion/InlineCompletionProvider';
import { CfnDevLspServerProvider } from './lsp-server/CfnDevLspServerProvider';
import { CfnRemoteLspServerProvider } from './lsp-server/CfnRemoteLspServerProvider';
import { LspServerResolver } from './lsp-server/LspServerProvider';
import { getClientId } from './telemetry/ClientId';
import { handleTelemetryOptIn } from './telemetry/TelemetryOptIn';
import { ExtensionId, ExtensionName, ExtensionVersion } from './utils/ExtensionConfig';
import { initFileSystem } from './utils/FileSystem';
import { LoggerFactory } from './utils/Logger';
import { extractErrorMessage, formatMessage } from './utils/Utils';

const outputChannel = window.createOutputChannel(ExtensionName);
LoggerFactory.initialize(outputChannel);
const log = LoggerFactory.getLogger('Extension');

let client: LanguageClient | undefined;
let awsCredentials: AwsCredentialsService | undefined;

export async function activate(context: ExtensionContext) {
    initFileSystem(context);
    context.subscriptions.push(
        restartCommand(async () => {
            log.info('Restarting server...');
            await initialize(context);
        }),
        outputChannel,
    );

    await initialize(context);
}

/* eslint-disable require-atomic-updates */
async function initialize(context: ExtensionContext) {
    if (client) {
        await client.stop();
        client = undefined;
    }

    if (awsCredentials) {
        awsCredentials.dispose();
        awsCredentials = undefined;
    }

    if (client) {
        throw new Error('LSP client is still running');
    }

    if (awsCredentials) {
        throw new Error('AWS service is still running');
    }

    try {
        log.info(`Activating v${ExtensionVersion}`);

        const telemetryEnabled = await handleTelemetryOptIn(context);
        const clientId = await getClientId(context.globalState);

        const serverProvider = new LspServerResolver([
            new CfnDevLspServerProvider(context),
            new CfnRemoteLspServerProvider(),
        ]);
        const serverFile = await serverProvider.serverExecutable();
        log.info(`Server executable: ${serverFile}`);

        const envOptions = {
            NODE_OPTIONS: '--enable-source-maps',
        };

        const serverOptions: ServerOptions = {
            run: {
                module: serverFile,
                transport: TransportKind.ipc,
                options: { env: envOptions },
            },
            debug: {
                module: serverFile,
                transport: TransportKind.ipc,
                options: {
                    execArgv: ['--no-lazy'],
                    env: envOptions,
                },
            },
        };

        const clientOptions: LanguageClientOptions = {
            outputChannel,
            documentSelector: [
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
            ],
            initializationOptions: {
                handledSchemaProtocols: ['file'],
                aws: {
                    clientInfo: {
                        extension: {
                            name: ExtensionId,
                            version: ExtensionVersion,
                        },
                        clientId,
                    },
                    telemetryEnabled,
                    encryption: {
                        key: randomBytes(32).toString('base64'),
                        mode: 'JWT',
                    },
                },
            },
            errorHandler: {
                error: (error, message) => {
                    log.error(message);
                    window.showErrorMessage(formatMessage(`Error: ${extractErrorMessage(error)}`));
                    return { action: ErrorAction.Continue };
                },
                closed: () => {
                    log.warn('Server connection closed');
                    return { action: CloseAction.DoNotRestart };
                },
            },
        };

        client = new LanguageClient(ExtensionId, ExtensionName, serverOptions, clientOptions);
        awsCredentials = new AwsCredentialsService(context);

        const documentSelector = [
            { scheme: 'file', language: 'cloudformation' },
            { scheme: 'file', language: 'yaml' },
            { scheme: 'file', language: 'json' },
        ];

        await client.start();
        const inlineCompletionProvider = languages.registerInlineCompletionItemProvider(
            documentSelector,
            new CfnInlineCompletionProvider(client),
        );

        context.subscriptions.push(
            client,
            awsCredentials,
            serverProvider,
            inlineCompletionProvider,
            updateRegion(awsCredentials),
            outputChannel,
        );

        await awsCredentials.initialize(client);
    } catch (err) {
        log.error(err, 'Activation failed');
        window.showErrorMessage(formatMessage(extractErrorMessage(err)));
    }
}

export function deactivate(): Thenable<void> | undefined {
    if (!client) {
        return undefined;
    }

    return client.stop();
}
