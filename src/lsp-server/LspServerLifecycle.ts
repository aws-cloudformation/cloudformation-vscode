import { CloseAction, ErrorAction, ErrorHandler, Message } from 'vscode-languageclient/node';
import { LoggerFactory } from '../utils/Logger';
import { extractErrorMessage } from '../utils/Utils';

export interface LspServerLifecycleHooks {
    /**
     * Decides whether a `startProcess` failure is eligible for the single invalidate-and-retry repair.
     * Defaults to repairing every failure. Return `false` for errors that a reinstall cannot fix.
     */
    shouldRepair?: (err: unknown) => boolean;
    /**
     * The connection closed unexpectedly after `initialize` completed. This is not an installation problem, so
     * no repair is attempted and the server is not restarted automatically.
     */
    onServerStopped?: () => void;
    /** A protocol or transport error was reported while the server was running. The client keeps going. */
    onError?: (error: Error, message: Message | undefined, count: number | undefined) => void;
}

export interface LspServerLifecycleConfig<T, R> extends LspServerLifecycleHooks {
    name: string;
    /**
     * Locates the server, installing it if necessary. Runs before every start attempt so a repair re-resolves
     * (and re-downloads) the server. Failures are never repaired and propagate unchanged.
     */
    resolveServer: () => Promise<R>;
    /**
     * Spawns the server and completes the LSP `initialize` handshake. Must reject if either step fails; on
     * rejection any partially created client must already be cleaned up by the callee.
     */
    startProcess: (server: R) => Promise<T>;
    /** Removes the resolved installation so the retry re-resolves (and re-downloads) the server. */
    invalidateAndReinstall: () => void | Promise<void>;
}

/**
 * Startup-recovery policy for the managed language server:
 *
 * - {@link launchWithRetry}: a process-start failure invalidates the installation and retries exactly once.
 * - {@link createErrorHandler}: errors continue, an unexpected close does not auto-restart (a restart is the
 *   user's decision), and a post-initialize close is reported through {@link LspServerLifecycleHooks.onServerStopped}.
 *
 * `LanguageClient.start()` spans the `initialize` handshake, so a server that dies before initializing rejects
 * `startProcess` and is repaired by the same single retry; {@link onServerStopped} deliberately does nothing for
 * that case so the repair budget is not spent twice.
 */
export class LspServerLifecycleController<T, R = void> {
    private readonly log = LoggerFactory.getLogger('LspServerLifecycle');
    private initialized = false;

    constructor(private readonly config: LspServerLifecycleConfig<T, R>) {}

    isInitialized(): boolean {
        return this.initialized;
    }

    /**
     * @param beforeAttempt Guard run before each attempt (e.g. to abort when disposed); a throw aborts the launch.
     */
    async launchWithRetry(beforeAttempt?: () => void): Promise<T> {
        this.initialized = false;
        const { name } = this.config;

        beforeAttempt?.();
        const firstServer = await this.config.resolveServer();
        try {
            return await this.config.startProcess(firstServer);
        } catch (firstErr) {
            if (!(this.config.shouldRepair?.(firstErr) ?? true)) {
                this.log.info(`${name}: start failure not eligible for repair: ${extractErrorMessage(firstErr)}`);
                throw firstErr;
            }

            this.log.warn(firstErr, `${name}: process start failed, invalidating and retrying once`);
            await this.config.invalidateAndReinstall();

            beforeAttempt?.();
            const server = await this.config.resolveServer();
            try {
                return await this.config.startProcess(server);
            } catch (secondErr) {
                throw new Error(`${name} failed to start after reinstalling: ${extractErrorMessage(secondErr)}`, {
                    cause: secondErr,
                });
            }
        }
    }

    /** Call once the client is running (after `initialize`). */
    onInitialized(): void {
        this.initialized = true;
    }

    /**
     * Call when the server connection closes. `shutdownNormally` is true when the close was requested by us
     * (stop/dispose); the `ErrorHandler` from {@link createErrorHandler} reports unexpected closes.
     */
    onServerStopped(shutdownNormally: boolean): void {
        const { name } = this.config;
        if (shutdownNormally) {
            this.initialized = false;
            return;
        }

        if (this.initialized) {
            this.log.error(`${name} stopped unexpectedly after initialization`);
            this.initialized = false;
            this.config.onServerStopped?.();
            return;
        }

        this.log.info(`${name} stopped before initialization; the pending launch handles the repair`);
    }

    /** `LanguageClientOptions.errorHandler` implementing the shared policy; set it on every client created. */
    createErrorHandler(): ErrorHandler {
        return {
            error: (error, message, count) => {
                this.config.onError?.(error, message, count);
                return { action: ErrorAction.Continue };
            },
            closed: () => {
                this.onServerStopped(false);
                return { action: CloseAction.DoNotRestart };
            },
        };
    }
}
