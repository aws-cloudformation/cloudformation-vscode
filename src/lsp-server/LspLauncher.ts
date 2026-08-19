import { Disposable } from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
import { LoggerFactory } from '../utils/Logger';

/**
 * Resolves the LSP server path for the launcher to use.
 */
export interface LspResolver {
    resolve(): Promise<string>;
    invalidate(): void;
}

/**
 * Creates a configured LanguageClient given the resolved server path.
 */
export type ClientFactory = (serverPath: string) => LanguageClient;

/**
 * Generic LSP launcher that:
 * - Deduplicates concurrent start attempts (only one in-flight at a time)
 * - If LanguageClient.start() rejects: dispose/stop the candidate client,
 *   invalidate the resolved provider, rerun the installer, and retry exactly once
 * - Integrates with VS Code extension disposal via Disposable
 */
export class LspLauncher implements Disposable {
    private readonly log = LoggerFactory.getLogger('LspLauncher');
    private readonly resolver: LspResolver;
    private readonly clientFactory: ClientFactory;
    private client?: LanguageClient;
    private startPromise?: Promise<LanguageClient>;
    private disposed = false;

    constructor(resolver: LspResolver, clientFactory: ClientFactory) {
        this.resolver = resolver;
        this.clientFactory = clientFactory;
    }

    /**
     * Returns the running client, starting it if needed. Deduplicates concurrent calls.
     */
    async start(): Promise<LanguageClient> {
        if (this.disposed) {
            throw new Error('Launcher has been disposed');
        }

        if (this.client) {
            return this.client;
        }

        if (this.startPromise) {
            return await this.startPromise;
        }

        this.startPromise = this.doStart();
        try {
            const result = await this.startPromise;
            return result;
        } finally {
            this.startPromise = undefined;
        }
    }

    /**
     * Stops and disposes the current client.
     */
    async stop(): Promise<void> {
        const c = this.client;
        this.client = undefined;
        if (c) {
            try {
                await c.stop();
            } catch (err) {
                this.log.warn(err, 'Error stopping client');
            }
            try {
                void c.dispose();
            } catch {
                // ignore
            }
        }
    }

    /**
     * Restarts the client — stop then start fresh.
     */
    async restart(): Promise<LanguageClient> {
        await this.stop();
        this.resolver.invalidate();
        return await this.start();
    }

    /**
     * Returns the current client if started, undefined otherwise.
     */
    getClient(): LanguageClient | undefined {
        return this.client;
    }

    dispose(): void {
        this.disposed = true;
        const c = this.client;
        this.client = undefined;
        if (c) {
            void c.stop();
            void c.dispose();
        }
    }

    private async doStart(): Promise<LanguageClient> {
        let candidate: LanguageClient | undefined;
        try {
            candidate = await this.attemptStart();
            this.client = candidate;
            return candidate;
        } catch (firstErr) {
            this.log.warn(firstErr, 'First start attempt failed, retrying once');

            // Dispose the failed candidate (not this.client — it was never set)
            if (firstErr instanceof ClientStartError) {
                await this.disposeCandidate(firstErr.client);
            }
            candidate = undefined;

            // Invalidate and re-resolve
            this.resolver.invalidate();

            try {
                candidate = await this.attemptStart();
                this.client = candidate;
                return candidate;
            } catch (retryErr) {
                this.log.error(retryErr, 'Retry start also failed');
                if (retryErr instanceof ClientStartError) {
                    await this.disposeCandidate(retryErr.client);
                }
                throw retryErr instanceof ClientStartError ? retryErr.cause : retryErr;
            }
        }
    }

    private async attemptStart(): Promise<LanguageClient> {
        const serverPath = await this.resolver.resolve();
        this.log.info(`Starting LSP client with server: ${serverPath}`);

        const client = this.clientFactory(serverPath);
        try {
            await client.start();
        } catch (err) {
            throw new ClientStartError(client, err);
        }
        return client;
    }

    private async disposeCandidate(candidate: LanguageClient | undefined): Promise<void> {
        if (!candidate) {
            return;
        }
        try {
            await candidate.stop();
        } catch {
            // ignore
        }
        try {
            void candidate.dispose();
        } catch {
            // ignore
        }
    }
}

/**
 * Internal error type that carries the client reference for cleanup.
 * Never escapes the LspLauncher — the original cause is re-thrown.
 */
class ClientStartError extends Error {
    readonly client: LanguageClient;
    override readonly cause: unknown;

    constructor(client: LanguageClient, cause: unknown) {
        super(cause instanceof Error ? cause.message : String(cause));
        this.client = client;
        this.cause = cause;
    }
}
