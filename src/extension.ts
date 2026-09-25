import { commands, Disposable, ExtensionContext, languages, window } from 'vscode';
import { ErrorHandler, LanguageClient, LanguageClientOptions } from 'vscode-languageclient/node';
import { AwsCredentialsService } from './auth/AwsCredentials';
import { restartCommand, RestartServerCommand, updateRegion } from './commands/Commands';
import { CfnInlineCompletionProvider } from './inlineCompletion/InlineCompletionProvider';
import { CfnDevLspServerProvider } from './lsp-server/CfnDevLspServerProvider';
import { CfnRemoteLspServerProvider } from './lsp-server/CfnRemoteLspServerProvider';
import { CfnDocumentSelector, cfnInitializationOptions, cfnServerOptions } from './lsp-server/LspClientConfig';
import { LspLauncher, LspResolver } from './lsp-server/LspLauncher';
import { LspServerResolver } from './lsp-server/LspServerProvider';
import { getClientId } from './telemetry/ClientId';
import { handleTelemetryOptIn } from './telemetry/TelemetryOptIn';
import { environment, ExtensionId, ExtensionName, ExtensionVersion } from './utils/ExtensionConfig';
import { initFileSystem } from './utils/FileSystem';
import { LoggerFactory } from './utils/Logger';
import { extractErrorMessage, formatMessage } from './utils/Utils';

const outputChannel = window.createOutputChannel(ExtensionName);
LoggerFactory.initialize(outputChannel);
const log = LoggerFactory.getLogger('Extension');

const serverStoppedMessage = formatMessage(
    'CloudFormation language server stopped unexpectedly. Restart it to continue using CloudFormation features.',
);
const restartServerAction = 'Restart Server';

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
            await this.launcher.stop();
            this.launcher.dispose();
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

        const clientFactory = (serverFile: string, errorHandler: ErrorHandler): LanguageClient => {
            log.info(`Server executable: ${serverFile}`);

            const clientOptions: LanguageClientOptions = {
                outputChannel,
                documentSelector: CfnDocumentSelector,
                initializationOptions: cfnInitializationOptions(telemetryEnabled, clientId),
                errorHandler,
            };

            return new LanguageClient(ExtensionId, ExtensionName, cfnServerOptions(serverFile), clientOptions);
        };

        const launcher = new LspLauncher(resolver, clientFactory, {
            onError: (error, message) => {
                log.error(message, extractErrorMessage(error));
                void window.showErrorMessage(formatMessage(`Error: ${extractErrorMessage(error)}`));
            },
            onServerStopped: () => {
                void window.showErrorMessage(serverStoppedMessage, restartServerAction).then((selection) => {
                    if (selection === restartServerAction) {
                        void commands.executeCommand(RestartServerCommand);
                    }
                });
            },
        });
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
