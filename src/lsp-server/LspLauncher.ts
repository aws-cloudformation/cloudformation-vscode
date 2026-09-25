import { Disposable } from 'vscode';
import { ErrorHandler, LanguageClient } from 'vscode-languageclient/node';
import { LoggerFactory } from '../utils/Logger';
import { LspServerLifecycleController, LspServerLifecycleHooks } from './LspServerLifecycle';

/**
 * Resolves the LSP server path for the launcher to use.
 */
export interface LspResolver {
    resolve(): Promise<string>;
    invalidate(): void;
}

/**
 * Creates a configured LanguageClient for the resolved server; `errorHandler` must be set on its options.
 */
export type ClientFactory = (serverPath: string, errorHandler: ErrorHandler) => LanguageClient;

const LauncherName = 'CloudFormation language server';

/**
 * Starts the language server and owns the running client for the session, running the startup-recovery
 * policy from {@link LspServerLifecycleController}. `stop()`/`dispose()` shut the client down.
 */
export class LspLauncher implements Disposable {
    private readonly log = LoggerFactory.getLogger('LspLauncher');
    private readonly lifecycle: LspServerLifecycleController<LanguageClient, string>;
    private client?: LanguageClient;
    private startPromise?: Promise<LanguageClient>;
    private disposed = false;

    constructor(
        resolver: LspResolver,
        private readonly clientFactory: ClientFactory,
        hooks: LspServerLifecycleHooks = {},
    ) {
        this.lifecycle = new LspServerLifecycleController<LanguageClient, string>({
            name: LauncherName,
            resolveServer: () => resolver.resolve(),
            startProcess: (serverPath) => this.startProcess(serverPath),
            invalidateAndReinstall: () => resolver.invalidate(),
            ...hooks,
        });
    }

    /**
     * Returns the running client, starting it if needed. Deduplicates concurrent calls.
     */
    async start(): Promise<LanguageClient> {
        this.throwIfDisposed('cannot start a disposed launcher');

        if (this.client) {
            return this.client;
        }

        if (this.startPromise) {
            return await this.startPromise;
        }

        this.startPromise = this.doStart();
        try {
            return await this.startPromise;
        } finally {
            this.startPromise = undefined;
        }
    }

    async stop(): Promise<void> {
        const client = this.client;
        this.client = undefined;
        if (client) {
            // We initiated this stop, so the ErrorHandler will not see it; tell the lifecycle directly.
            this.lifecycle.onServerStopped(true);
            await this.stopAndDispose(client);
        }
    }

    dispose(): void {
        this.disposed = true;
        void this.stop();
    }

    private async doStart(): Promise<LanguageClient> {
        // Resolving may download the server, so no attempt starts once the launcher has been disposed.
        const candidate = await this.lifecycle.launchWithRetry(() =>
            this.throwIfDisposed('launcher disposed during start'),
        );

        if (this.disposed) {
            await this.stopAndDispose(candidate);
            this.throwIfDisposed('launcher disposed during start');
        }

        this.client = candidate;
        this.lifecycle.onInitialized();
        return candidate;
    }

    /** Creates the client and completes `initialize`; a partially created client is cleaned up on failure. */
    private async startProcess(serverPath: string): Promise<LanguageClient> {
        this.log.info(`Starting LSP client with server: ${serverPath}`);
        const candidate = this.clientFactory(serverPath, this.lifecycle.createErrorHandler());
        try {
            await candidate.start();
            return candidate;
        } catch (err) {
            await this.stopAndDispose(candidate);
            throw err;
        }
    }

    private async stopAndDispose(client: LanguageClient): Promise<void> {
        try {
            await client.stop();
        } catch (err) {
            this.log.warn(err, 'Error stopping language client');
        }
        try {
            await client.dispose();
        } catch (err) {
            this.log.warn(err, 'Error disposing language client');
        }
    }

    private throwIfDisposed(reason: string): void {
        if (this.disposed) {
            throw new Error(`Launcher has been disposed: ${reason}`);
        }
    }
}
