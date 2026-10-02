import { describe, beforeEach, it, expect, Mock, vi } from 'vitest';
import { window } from 'vscode';
import { CloseAction, ErrorAction, ErrorHandler, LanguageClient } from 'vscode-languageclient/node';
import { ClientFactory, LspLauncher, LspResolver } from '../../src/lsp-server/LspLauncher';
import { LspServerLifecycleHooks } from '../../src/lsp-server/LspServerLifecycle';
import { LoggerFactory } from '../../src/utils/Logger';

vi.mock('vscode');
vi.mock('vscode-languageclient/node');

type FakeClient = {
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
};

function fakeClient(start: () => Promise<void> = () => Promise.resolve()): FakeClient {
    return {
        start: vi.fn(start),
        stop: vi.fn().mockResolvedValue(undefined),
        dispose: vi.fn().mockResolvedValue(undefined),
    };
}

describe('LspLauncher', () => {
    let resolver: { resolve: Mock<LspResolver['resolve']>; invalidate: Mock<LspResolver['invalidate']> };
    let hooks: {
        onError: Mock<NonNullable<LspServerLifecycleHooks['onError']>>;
        onServerStopped: Mock<NonNullable<LspServerLifecycleHooks['onServerStopped']>>;
    };
    let clients: FakeClient[];
    let factory: Mock<ClientFactory>;

    function launcherStartingClients(...starts: Array<() => Promise<void>>): LspLauncher {
        clients = starts.map((start) => fakeClient(start));
        let next = 0;
        factory = vi.fn<ClientFactory>(() => clients[next++] as unknown as LanguageClient);
        return new LspLauncher(resolver, factory, hooks);
    }

    function errorHandlerOf(call = 0): ErrorHandler {
        return factory.mock.calls[call][1];
    }

    const succeed = () => Promise.resolve();
    const fail = (message: string) => () => Promise.reject(new Error(message));

    beforeEach(() => {
        LoggerFactory.reset();
        LoggerFactory.initialize(window.createOutputChannel('test', { log: true }));

        let resolveCount = 0;
        resolver = {
            resolve: vi.fn(() => Promise.resolve(`/servers/attempt-${++resolveCount}/server.js`)),
            invalidate: vi.fn(),
        };
        hooks = { onError: vi.fn(), onServerStopped: vi.fn() };
    });

    describe('start', () => {
        it('creates the client for the resolved server with the launcher-owned error handler', async () => {
            const launcher = launcherStartingClients(succeed);

            const client = await launcher.start();

            expect(client).toBe(clients[0]);
            expect(factory).toHaveBeenCalledWith('/servers/attempt-1/server.js', expect.any(Object));
            expect(clients[0].start).toHaveBeenCalledTimes(1);
            expect(resolver.invalidate).not.toHaveBeenCalled();
        });

        it('returns the running client on later calls without resolving again', async () => {
            const launcher = launcherStartingClients(succeed);

            const first = await launcher.start();
            const second = await launcher.start();

            expect(second).toBe(first);
            expect(resolver.resolve).toHaveBeenCalledTimes(1);
        });

        it('deduplicates concurrent start calls', async () => {
            const launcher = launcherStartingClients(succeed);

            const [first, second, third] = await Promise.all([launcher.start(), launcher.start(), launcher.start()]);

            expect(first).toBe(second);
            expect(second).toBe(third);
            expect(factory).toHaveBeenCalledTimes(1);
        });
    });

    describe('startup repair', () => {
        it('invalidates the installation and retries exactly once after a process start failure', async () => {
            const launcher = launcherStartingClients(fail('spawn failed'), succeed);

            const client = await launcher.start();

            expect(client).toBe(clients[1]);
            expect(resolver.invalidate).toHaveBeenCalledTimes(1);
            expect(factory).toHaveBeenNthCalledWith(2, '/servers/attempt-2/server.js', expect.any(Object));
        });

        it('stops and disposes a candidate whose start failed', async () => {
            const launcher = launcherStartingClients(fail('spawn failed'), succeed);

            await launcher.start();

            expect(clients[0].stop).toHaveBeenCalledTimes(1);
            expect(clients[0].dispose).toHaveBeenCalledTimes(1);
        });

        it('reports a second start failure with the underlying error as its cause', async () => {
            const launcher = launcherStartingClients(fail('first'), fail('second'));

            const error: unknown = await launcher.start().catch((err: unknown) => err);

            expect(error).toBeInstanceOf(Error);
            expect((error as Error).message).toBe(
                'CloudFormation language server failed to start after reinstalling: second',
            );
            expect(((error as Error).cause as Error).message).toBe('second');
            expect(resolver.invalidate).toHaveBeenCalledTimes(1);
            expect(clients[1].dispose).toHaveBeenCalledTimes(1);
        });

        it('never repairs a resolution failure', async () => {
            const launcher = launcherStartingClients(succeed);
            resolver.resolve.mockRejectedValueOnce(new Error('manifest fetch failed'));

            await expect(launcher.start()).rejects.toThrow('manifest fetch failed');
            expect(resolver.invalidate).not.toHaveBeenCalled();
            expect(factory).not.toHaveBeenCalled();
        });

        it('propagates a resolution failure on the retry without wrapping it', async () => {
            const launcher = launcherStartingClients(fail('spawn failed'));
            resolver.resolve
                .mockResolvedValueOnce('/servers/broken/server.js')
                .mockRejectedValueOnce(new Error('download failed'));

            await expect(launcher.start()).rejects.toThrow(/^download failed$/);
            expect(resolver.invalidate).toHaveBeenCalledTimes(1);
        });
    });

    describe('error handler', () => {
        it('forwards errors to onError and keeps the client running', async () => {
            const launcher = launcherStartingClients(succeed);
            await launcher.start();
            const error = new Error('write failed');

            const result = await errorHandlerOf().error(error, undefined, 1);

            expect(result).toEqual({ action: ErrorAction.Continue });
            expect(hooks.onError).toHaveBeenCalledWith(error, undefined, 1);
        });

        it('reports an unexpected close after initialize once and does not auto-restart', async () => {
            const launcher = launcherStartingClients(succeed);
            await launcher.start();

            const result = await errorHandlerOf().closed();
            await errorHandlerOf().closed();

            expect(result).toEqual({ action: CloseAction.DoNotRestart });
            expect(hooks.onServerStopped).toHaveBeenCalledTimes(1);
            expect(resolver.invalidate).not.toHaveBeenCalled();
        });

        it('leaves a close before initialize to the pending launch', async () => {
            let failStart: (err: Error) => void = () => {};
            const launcher = launcherStartingClients(
                () => new Promise<void>((_resolve, reject) => (failStart = reject)),
                succeed,
            );
            const pending = launcher.start();
            await vi.waitFor(() => expect(clients[0].start).toHaveBeenCalled());

            await errorHandlerOf().closed();
            failStart(new Error('died during initialize'));

            expect(await pending).toBe(clients[1]);
            expect(hooks.onServerStopped).not.toHaveBeenCalled();
            expect(resolver.invalidate).toHaveBeenCalledTimes(1);
        });

        it('does not report a stop that the launcher requested', async () => {
            const launcher = launcherStartingClients(succeed);
            await launcher.start();

            await launcher.stop();
            await errorHandlerOf().closed();

            expect(hooks.onServerStopped).not.toHaveBeenCalled();
        });
    });

    describe('stop and dispose', () => {
        it('stops and disposes the running client, allowing a fresh start', async () => {
            const launcher = launcherStartingClients(succeed, succeed);
            await launcher.start();

            await launcher.stop();
            const restarted = await launcher.start();

            expect(clients[0].stop).toHaveBeenCalledTimes(1);
            expect(clients[0].dispose).toHaveBeenCalledTimes(1);
            expect(restarted).toBe(clients[1]);
        });

        it('is safe to stop when no client is running', async () => {
            const launcher = launcherStartingClients();

            await expect(launcher.stop()).resolves.toBeUndefined();
        });

        it('rejects starts after disposal', async () => {
            const launcher = launcherStartingClients(succeed);
            await launcher.start();

            launcher.dispose();

            expect(clients[0].stop).toHaveBeenCalledTimes(1);
            await expect(launcher.start()).rejects.toThrow('Launcher has been disposed');
        });

        it('stops a client whose start completes after disposal', async () => {
            let finishStart: () => void = () => {};
            const launcher = launcherStartingClients(() => new Promise<void>((resolve) => (finishStart = resolve)));
            const pending = launcher.start();
            await vi.waitFor(() => expect(clients[0].start).toHaveBeenCalled());

            launcher.dispose();
            finishStart();

            await expect(pending).rejects.toThrow('Launcher has been disposed');
            expect(clients[0].stop).toHaveBeenCalledTimes(1);
        });

        it('does not re-resolve the server when disposed during the repair', async () => {
            let failStart: (err: Error) => void = () => {};
            const launcher = launcherStartingClients(
                () => new Promise<void>((_resolve, reject) => (failStart = reject)),
                succeed,
            );
            const pending = launcher.start();
            await vi.waitFor(() => expect(clients[0].start).toHaveBeenCalled());

            launcher.dispose();
            failStart(new Error('spawn failed'));

            await expect(pending).rejects.toThrow('Launcher has been disposed');
            expect(resolver.resolve).toHaveBeenCalledTimes(1);
        });
    });
});
