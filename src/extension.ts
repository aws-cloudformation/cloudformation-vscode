import { randomBytes } from 'crypto';
import { Disposable, ExtensionContext, languages, window } from 'vscode';
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
import { LspLauncher, LspResolver } from './lsp-server/LspLauncher';
import { LspServerResolver } from './lsp-server/LspServerProvider';
import { getClientId } from './telemetry/ClientId';
import { handleTelemetryOptIn } from './telemetry/TelemetryOptIn';
import { CfnLspClientName, environment, ExtensionId, ExtensionName, ExtensionVersion } from './utils/ExtensionConfig';
import { initFileSystem } from './utils/FileSystem';
import { LoggerFactory } from './utils/Logger';
import { extractErrorMessage, formatMessage } from './utils/Utils';

const outputChannel = window.createOutputChannel(ExtensionName);
LoggerFactory.initialize(outputChannel);
const log = LoggerFactory.getLogger('Extension');

const documentSelector = [
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
];

const inlineCompletionSelector = [
    { scheme: 'file', language: 'cloudformation' },
    { scheme: 'file', language: 'yaml' },
    { scheme: 'file', language: 'json' },
];

/**
 * Encapsulates a single active LSP session's resources for deterministic disposal.
 * Each restart creates a new session; the previous one is fully disposed first.
 */
class ActiveSession implements Disposable {
    private readonly disposables: Disposable[] = [];
    private launcher?: LspLauncher;
    private disposed = false;

    addDisposable(d: Disposable): void {
        this.disposables.push(d);
    }

    setLauncher(l: LspLauncher): void {
        this.launcher = l;
    }

    async dispose(): Promise<void> {
        if (this.disposed) {
            return;
        }
        this.disposed = true;

        if (this.launcher) {
            try {
                await this.launcher.stop();
            } catch (err) {
                log.warn(err, 'Launcher stop failed during session disposal');
            }
            try {
                this.launcher.dispose();
            } catch (err) {
                log.warn(err, 'Launcher dispose failed during session disposal');
            }
            this.launcher = undefined;
        }

        for (let i = this.disposables.length - 1; i >= 0; i--) {
            try {
                this.disposables[i].dispose();
            } catch (err) {
                log.warn(err, `Disposable cleanup failed at index ${i}`);
            }
        }
        this.disposables.length = 0;
    }
}

/** The single active session; replaced on each initialize/restart. */
let activeSession: ActiveSession | undefined;

export async function activate(context: ExtensionContext) {
    initFileSystem(context);

    // Extension-lifetime disposer: tears down whatever the current session is
    context.subscriptions.push(
        restartCommand(async () => {
            log.info('Restarting server...');
            await initialize(context);
        }),
        outputChannel,
        { dispose: () => void activeSession?.dispose() },
    );

    await initialize(context);
}

/* eslint-disable require-atomic-updates */
async function initialize(context: ExtensionContext) {
    // Dispose previous active session (awaits launcher stop)
    if (activeSession) {
        await activeSession.dispose();
        activeSession = undefined;
    }

    const session = new ActiveSession();
    activeSession = session;

    try {
        log.info(`Activating v${ExtensionVersion}`);

        const telemetryEnabled = await handleTelemetryOptIn(context);
        const clientId = await getClientId(context.globalState, telemetryEnabled);

        const channel = environment();
        const remoteProvider = new CfnRemoteLspServerProvider(channel);
        const serverResolver = new LspServerResolver([new CfnDevLspServerProvider(context), remoteProvider]);
        session.addDisposable(serverResolver);

        const resolver: LspResolver = {
            resolve: async () => await serverResolver.serverExecutable(),
            invalidate: () => {
                serverResolver.resetResolution();
                remoteProvider.invalidate();
            },
        };

        const clientFactory = (serverFile: string): LanguageClient => {
            log.info(`Server executable: ${serverFile}`);

            const envOptions = { NODE_OPTIONS: '--enable-source-maps' };

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
                documentSelector,
                initializationOptions: {
                    handledSchemaProtocols: ['file'],
                    aws: {
                        clientInfo: {
                            extension: {
                                name: CfnLspClientName,
                                version: ExtensionVersion,
                            },
                            // Omit clientId when telemetry is disabled
                            ...(clientId ? { clientId } : {}),
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

            return new LanguageClient(ExtensionId, ExtensionName, serverOptions, clientOptions);
        };

        const launcher = new LspLauncher(resolver, clientFactory);
        session.setLauncher(launcher);

        const client = await launcher.start();

        // Register providers and services AFTER successful start
        const awsCredentials = new AwsCredentialsService(context);
        session.addDisposable(awsCredentials);

        const inlineCompletionProvider = languages.registerInlineCompletionItemProvider(
            inlineCompletionSelector,
            new CfnInlineCompletionProvider(client),
        );
        session.addDisposable(inlineCompletionProvider);
        session.addDisposable(updateRegion(awsCredentials));

        await awsCredentials.initialize(client);
    } catch (err) {
        log.error(err, 'Activation failed');
        window.showErrorMessage(formatMessage(extractErrorMessage(err)));

        // Dispose the partially-activated session so it doesn't persist until restart
        if (activeSession === session) {
            activeSession = undefined;
        }
        await session.dispose();
    }
}

export function deactivate(): Thenable<void> | undefined {
    const session = activeSession;
    activeSession = undefined;
    if (!session) {
        return undefined;
    }
    return session.dispose();
}
