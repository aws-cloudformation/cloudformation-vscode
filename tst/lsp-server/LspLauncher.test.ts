import { describe, beforeEach, it, expect, vi } from 'vitest';
import { window } from 'vscode';
import { LspLauncher, LspResolver } from '../../src/lsp-server/LspLauncher';
import { LoggerFactory } from '../../src/utils/Logger';

vi.mock('vscode');
vi.mock('vscode-languageclient/node');

describe('LspLauncher', () => {
    let resolver: LspResolver;
    let startFn: ReturnType<typeof vi.fn>;
    let stopFn: ReturnType<typeof vi.fn>;
    let disposeFn: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        LoggerFactory.reset();
        LoggerFactory.initialize(window.createOutputChannel('test'));

        startFn = vi.fn().mockResolvedValue(undefined);
        stopFn = vi.fn().mockResolvedValue(undefined);
        disposeFn = vi.fn();

        resolver = {
            resolve: vi.fn(async () => {
                return await Promise.resolve('/path/to/server.js');
            }),
            invalidate: vi.fn(),
        };
    });

    function makeClientFactory() {
        return vi.fn().mockImplementation(() => ({
            start: startFn,
            stop: stopFn,
            dispose: disposeFn,
            isRunning: vi.fn().mockReturnValue(true),
        }));
    }

    describe('start', () => {
        it('resolves and starts the client on first call', async () => {
            const factory = makeClientFactory();
            const launcher = new LspLauncher(resolver, factory);

            const client = await launcher.start();

            expect(resolver.resolve).toHaveBeenCalledTimes(1);
            expect(factory).toHaveBeenCalledWith('/path/to/server.js');
            expect(startFn).toHaveBeenCalledTimes(1);
            expect(client).toBeDefined();
        });

        it('returns cached client on subsequent calls', async () => {
            const factory = makeClientFactory();
            const launcher = new LspLauncher(resolver, factory);

            const first = await launcher.start();
            const second = await launcher.start();

            expect(first).toBe(second);
            expect(resolver.resolve).toHaveBeenCalledTimes(1);
            expect(startFn).toHaveBeenCalledTimes(1);
        });

        it('deduplicates concurrent start attempts', async () => {
            const factory = makeClientFactory();
            const launcher = new LspLauncher(resolver, factory);

            const [first, second, third] = await Promise.all([launcher.start(), launcher.start(), launcher.start()]);

            expect(first).toBe(second);
            expect(second).toBe(third);
            expect(resolver.resolve).toHaveBeenCalledTimes(1);
            expect(startFn).toHaveBeenCalledTimes(1);
        });

        it('retries exactly once on start failure (invalidate + re-resolve)', async () => {
            let attempt = 0;
            startFn = vi.fn().mockImplementation(() => {
                attempt++;
                if (attempt === 1) {
                    return Promise.reject(new Error('Start failed'));
                }
                return Promise.resolve(undefined);
            });

            const factory = vi.fn().mockImplementation(() => ({
                start: startFn,
                stop: stopFn,
                dispose: disposeFn,
                isRunning: vi.fn().mockReturnValue(true),
            }));
            const launcher = new LspLauncher(resolver, factory);

            const client = await launcher.start();

            expect(client).toBeDefined();
            expect(resolver.invalidate).toHaveBeenCalledTimes(1);
            expect(resolver.resolve).toHaveBeenCalledTimes(2);
            expect(startFn).toHaveBeenCalledTimes(2);
        });

        it('throws after retry also fails', async () => {
            startFn.mockRejectedValue(new Error('Permanent failure'));

            const factory = makeClientFactory();
            const launcher = new LspLauncher(resolver, factory);

            await expect(launcher.start()).rejects.toThrow('Permanent failure');
            expect(resolver.invalidate).toHaveBeenCalledTimes(1);
            expect(resolver.resolve).toHaveBeenCalledTimes(2);
        });

        it('throws when disposed', async () => {
            const factory = makeClientFactory();
            const launcher = new LspLauncher(resolver, factory);
            launcher.dispose();

            await expect(launcher.start()).rejects.toThrow('disposed');
        });

        it('stops/disposes the local candidate on first start failure', async () => {
            const firstStopFn = vi.fn().mockResolvedValue(undefined);
            const firstDisposeFn = vi.fn();
            let attempt = 0;

            const factory = vi.fn().mockImplementation(() => {
                attempt++;
                if (attempt === 1) {
                    return {
                        start: vi.fn().mockRejectedValue(new Error('first fail')),
                        stop: firstStopFn,
                        dispose: firstDisposeFn,
                    };
                }
                return {
                    start: vi.fn().mockResolvedValue(undefined),
                    stop: vi.fn().mockResolvedValue(undefined),
                    dispose: vi.fn(),
                };
            });

            const launcher = new LspLauncher(resolver, factory);
            const client = await launcher.start();

            expect(client).toBeDefined();
            // The first candidate should have been stopped and disposed
            expect(firstStopFn).toHaveBeenCalledTimes(1);
            expect(firstDisposeFn).toHaveBeenCalledTimes(1);
        });

        it('stops/disposes the local candidate on second (retry) failure', async () => {
            const firstStopFn = vi.fn().mockResolvedValue(undefined);
            const firstDisposeFn = vi.fn();
            const secondStopFn = vi.fn().mockResolvedValue(undefined);
            const secondDisposeFn = vi.fn();
            let attempt = 0;

            const factory = vi.fn().mockImplementation(() => {
                attempt++;
                if (attempt === 1) {
                    return {
                        start: vi.fn().mockRejectedValue(new Error('first fail')),
                        stop: firstStopFn,
                        dispose: firstDisposeFn,
                    };
                }
                return {
                    start: vi.fn().mockRejectedValue(new Error('second fail')),
                    stop: secondStopFn,
                    dispose: secondDisposeFn,
                };
            });

            const launcher = new LspLauncher(resolver, factory);
            await expect(launcher.start()).rejects.toThrow();

            // Both candidates should have been stopped and disposed
            expect(firstStopFn).toHaveBeenCalledTimes(1);
            expect(firstDisposeFn).toHaveBeenCalledTimes(1);
            expect(secondStopFn).toHaveBeenCalledTimes(1);
            expect(secondDisposeFn).toHaveBeenCalledTimes(1);
        });
    });

    describe('stop', () => {
        it('stops and disposes the running client', async () => {
            const factory = makeClientFactory();
            const launcher = new LspLauncher(resolver, factory);
            await launcher.start();

            await launcher.stop();

            expect(stopFn).toHaveBeenCalled();
            expect(disposeFn).toHaveBeenCalled();
            expect(launcher.getClient()).toBeUndefined();
        });

        it('is safe to call when no client is running', async () => {
            const factory = makeClientFactory();
            const launcher = new LspLauncher(resolver, factory);

            await expect(launcher.stop()).resolves.toBeUndefined();
        });
    });

    describe('restart', () => {
        it('stops current client, invalidates, and starts fresh', async () => {
            const factory = makeClientFactory();
            const launcher = new LspLauncher(resolver, factory);
            await launcher.start();

            await launcher.restart();

            expect(stopFn).toHaveBeenCalled();
            expect(resolver.invalidate).toHaveBeenCalledTimes(1);
            expect(resolver.resolve).toHaveBeenCalledTimes(2); // initial + restart
            expect(startFn).toHaveBeenCalledTimes(2);
        });
    });

    describe('invalidation forces fresh resolve', () => {
        it('first start failure triggers invalidate so retry gets a fresh path', async () => {
            // Track what paths were resolved
            const resolvedPaths: string[] = [];
            let callCount = 0;
            resolver = {
                resolve: vi.fn().mockImplementation(() => {
                    callCount++;
                    const path = `/path/to/server-attempt-${callCount}.js`;
                    resolvedPaths.push(path);
                    return Promise.resolve(path);
                }),
                invalidate: vi.fn(),
            };

            let attempt = 0;
            const factory = vi.fn().mockImplementation(() => {
                attempt++;
                if (attempt === 1) {
                    return {
                        start: vi.fn().mockRejectedValue(new Error('first fail')),
                        stop: vi.fn().mockResolvedValue(undefined),
                        dispose: vi.fn(),
                    };
                }
                return {
                    start: vi.fn().mockResolvedValue(undefined),
                    stop: vi.fn().mockResolvedValue(undefined),
                    dispose: vi.fn(),
                };
            });

            const launcher = new LspLauncher(resolver, factory);
            await launcher.start();

            // invalidate was called between attempts
            expect(resolver.invalidate).toHaveBeenCalledTimes(1);
            // Two different paths were resolved (invalidation forced fresh resolve)
            expect(resolvedPaths).toHaveLength(2);
            expect(resolvedPaths[0]).not.toBe(resolvedPaths[1]);
        });

        it('restart invalidates before re-resolving so cached path is not reused', async () => {
            const resolvedPaths: string[] = [];
            let callCount = 0;
            resolver = {
                resolve: vi.fn().mockImplementation(() => {
                    callCount++;
                    const path = `/path/to/server-v${callCount}.js`;
                    resolvedPaths.push(path);
                    return Promise.resolve(path);
                }),
                invalidate: vi.fn(),
            };

            const factory = makeClientFactory();
            const launcher = new LspLauncher(resolver, factory);
            await launcher.start();

            expect(resolvedPaths).toHaveLength(1);

            await launcher.restart();

            expect(resolver.invalidate).toHaveBeenCalledTimes(1);
            expect(resolvedPaths).toHaveLength(2);
            // The second resolve produced a different path (simulating fresh resolution)
            expect(resolvedPaths[0]).not.toBe(resolvedPaths[1]);
        });
    });

    describe('dispose', () => {
        it('marks launcher as disposed and cleans up client', async () => {
            const factory = makeClientFactory();
            const launcher = new LspLauncher(resolver, factory);
            await launcher.start();

            launcher.dispose();

            expect(launcher.getClient()).toBeUndefined();
            await expect(launcher.start()).rejects.toThrow('disposed');
        });
    });
});
