import { describe, beforeEach, it, expect, Mock, vi } from 'vitest';
import { window } from 'vscode';
import { CloseAction, ErrorAction } from 'vscode-languageclient/node';
import { LspServerLifecycleConfig, LspServerLifecycleController } from '../../src/lsp-server/LspServerLifecycle';
import { LoggerFactory } from '../../src/utils/Logger';

vi.mock('vscode');
vi.mock('vscode-languageclient/node');

type Config = LspServerLifecycleConfig<string, string>;

describe('LspServerLifecycleController', () => {
    let resolveServer: Mock<Config['resolveServer']>;
    let startProcess: Mock<Config['startProcess']>;
    let invalidateAndReinstall: Mock<Config['invalidateAndReinstall']>;
    let onServerStopped: Mock<() => void>;
    let onError: Mock<NonNullable<Config['onError']>>;

    function controller(overrides: Partial<Config> = {}): LspServerLifecycleController<string, string> {
        return new LspServerLifecycleController<string, string>({
            name: 'test server',
            resolveServer,
            startProcess,
            invalidateAndReinstall,
            onServerStopped,
            onError,
            ...overrides,
        });
    }

    beforeEach(() => {
        LoggerFactory.reset();
        LoggerFactory.initialize(window.createOutputChannel('test', { log: true }));

        let resolveCount = 0;
        resolveServer = vi.fn(() => Promise.resolve(`server-${++resolveCount}`));
        startProcess = vi.fn((server: string) => Promise.resolve(`client for ${server}`));
        invalidateAndReinstall = vi.fn();
        onServerStopped = vi.fn();
        onError = vi.fn();
    });

    describe('launchWithRetry', () => {
        it('starts the resolved server without invalidating when the first attempt succeeds', async () => {
            const client = await controller().launchWithRetry();

            expect(client).toBe('client for server-1');
            expect(invalidateAndReinstall).not.toHaveBeenCalled();
        });

        it('retries exactly once, invalidating and re-resolving in between', async () => {
            startProcess.mockRejectedValueOnce(new Error('spawn failed'));

            const client = await controller().launchWithRetry();

            expect(client).toBe('client for server-2');
            expect(invalidateAndReinstall).toHaveBeenCalledTimes(1);
            expect(startProcess.mock.calls.map(([server]) => server)).toEqual(['server-1', 'server-2']);
        });

        it('does not retry more than once and reports the second failure as the cause', async () => {
            startProcess.mockRejectedValueOnce(new Error('first')).mockRejectedValueOnce(new Error('second'));

            const error: unknown = await controller()
                .launchWithRetry()
                .catch((err: unknown) => err);

            expect((error as Error).message).toBe('test server failed to start after reinstalling: second');
            expect(((error as Error).cause as Error).message).toBe('second');
            expect(invalidateAndReinstall).toHaveBeenCalledTimes(1);
            expect(startProcess).toHaveBeenCalledTimes(2);
        });

        it('never repairs a resolution failure', async () => {
            resolveServer.mockRejectedValueOnce(new Error('manifest fetch failed'));

            await expect(controller().launchWithRetry()).rejects.toThrow('manifest fetch failed');
            expect(invalidateAndReinstall).not.toHaveBeenCalled();
            expect(startProcess).not.toHaveBeenCalled();
        });

        it('propagates a resolution failure on the retry without wrapping it', async () => {
            startProcess.mockRejectedValueOnce(new Error('spawn failed'));
            resolveServer.mockResolvedValueOnce('server-1').mockRejectedValueOnce(new Error('download failed'));

            await expect(controller().launchWithRetry()).rejects.toThrow(/^download failed$/);
            expect(invalidateAndReinstall).toHaveBeenCalledTimes(1);
        });

        it('does not repair a failure that shouldRepair rejects', async () => {
            startProcess.mockRejectedValueOnce(new Error('node missing'));

            await expect(controller({ shouldRepair: () => false }).launchWithRetry()).rejects.toThrow(/^node missing$/);
            expect(invalidateAndReinstall).not.toHaveBeenCalled();
            expect(startProcess).toHaveBeenCalledTimes(1);
        });

        it('runs the beforeAttempt guard before each attempt and aborts when it throws', async () => {
            startProcess.mockRejectedValueOnce(new Error('spawn failed'));
            const beforeAttempt = vi
                .fn()
                .mockImplementationOnce(() => {})
                .mockImplementationOnce(() => {
                    throw new Error('disposed');
                });

            await expect(controller().launchWithRetry(beforeAttempt)).rejects.toThrow('disposed');
            expect(beforeAttempt).toHaveBeenCalledTimes(2);
            expect(resolveServer).toHaveBeenCalledTimes(1);
        });

        it('resets the initialized flag before starting', async () => {
            const lifecycle = controller();
            lifecycle.onInitialized();

            const pending = lifecycle.launchWithRetry();

            expect(lifecycle.isInitialized()).toBe(false);
            await pending;
        });
    });

    describe('onServerStopped', () => {
        it('resets the initialized flag on a normal stop without notifying', () => {
            const lifecycle = controller();
            lifecycle.onInitialized();

            lifecycle.onServerStopped(true);

            expect(lifecycle.isInitialized()).toBe(false);
            expect(onServerStopped).not.toHaveBeenCalled();
        });

        it('notifies once for an unexpected stop after initialization and does not reinstall', () => {
            const lifecycle = controller();
            lifecycle.onInitialized();

            lifecycle.onServerStopped(false);
            lifecycle.onServerStopped(false);

            expect(onServerStopped).toHaveBeenCalledTimes(1);
            expect(invalidateAndReinstall).not.toHaveBeenCalled();
        });

        it('leaves an unexpected stop before initialization to the pending launch', () => {
            controller().onServerStopped(false);

            expect(onServerStopped).not.toHaveBeenCalled();
            expect(invalidateAndReinstall).not.toHaveBeenCalled();
        });
    });

    describe('createErrorHandler', () => {
        it('continues on error and forwards it to onError', async () => {
            const error = new Error('write failed');

            const result = await controller().createErrorHandler().error(error, undefined, 3);

            expect(result).toEqual({ action: ErrorAction.Continue });
            expect(onError).toHaveBeenCalledWith(error, undefined, 3);
        });

        it('does not auto-restart on close and routes the close through onServerStopped', async () => {
            const lifecycle = controller();
            lifecycle.onInitialized();

            const result = await lifecycle.createErrorHandler().closed();

            expect(result).toEqual({ action: CloseAction.DoNotRestart });
            expect(onServerStopped).toHaveBeenCalledTimes(1);
        });
    });

    it('full lifecycle: a post-initialize crash does not reinstall, a relaunch repairs a start failure', async () => {
        const lifecycle = controller();
        await lifecycle.launchWithRetry();
        lifecycle.onInitialized();

        lifecycle.onServerStopped(false);
        expect(onServerStopped).toHaveBeenCalledTimes(1);
        expect(invalidateAndReinstall).not.toHaveBeenCalled();

        startProcess.mockRejectedValueOnce(new Error('spawn failed'));
        const client = await lifecycle.launchWithRetry();

        expect(client).toBe('client for server-3');
        expect(invalidateAndReinstall).toHaveBeenCalledTimes(1);
    });
});
