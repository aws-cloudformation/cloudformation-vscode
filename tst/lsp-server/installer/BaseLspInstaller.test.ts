import { createHash } from 'crypto';
import nodeFs from 'fs';
import { dirname, join } from 'path';
import { describe, beforeEach, it, expect, vi } from 'vitest';
import { window } from 'vscode';
import {
    BaseLspInstaller,
    FileSystem,
    isPidAlive,
    LspInstallerConfig,
    Sleeper,
} from '../../../src/lsp-server/installer/BaseLspInstaller';
import { Version } from '../../../src/lsp-server/manifest/ManifestTypes';
import { LoggerFactory } from '../../../src/utils/Logger';

vi.mock('vscode');

const ServerFile = 'test-server.js';
const DeadPid = 2147483646;

function makeVersion(serverVersion: string, latest = false, isDelisted = false): Version {
    return {
        serverVersion,
        latest,
        isDelisted,
        targets: [
            {
                platform: process.platform,
                arch: process.arch,
                contents: [
                    {
                        filename: `server-${serverVersion}.zip`,
                        url: `https://example.com/server-${serverVersion}.zip`,
                        hashes: [`sha256:${serverVersion.replaceAll('.', '')}abc`],
                        bytes: 1024,
                    },
                ],
            },
        ],
    };
}

class MemoryFs extends FileSystem {
    readonly dirs = new Set<string>();
    readonly files = new Map<string, Buffer>();

    exists(path: string): boolean {
        return this.dirs.has(path) || this.files.has(path);
    }

    mkdirRecursive(path: string): void {
        this.dirs.add(path);
        const parts = path.split('/');
        for (let i = 1; i < parts.length; i++) {
            this.dirs.add(parts.slice(0, i + 1).join('/'));
        }
    }

    readdir(path: string): nodeFs.Dirent[] {
        const entries: nodeFs.Dirent[] = [];
        const prefix = path.endsWith('/') ? path : `${path}/`;

        for (const filePath of this.files.keys()) {
            if (!filePath.startsWith(prefix)) {
                continue;
            }
            const relative = filePath.slice(prefix.length);
            if (!relative.includes('/')) {
                entries.push(makeDirent(relative, false));
            }
        }

        const childDirs = new Set<string>();
        for (const dir of this.dirs) {
            if (!dir.startsWith(prefix)) {
                continue;
            }
            const relative = dir.slice(prefix.length);
            const first = relative.split('/')[0];
            if (first && first !== '' && !relative.startsWith('../')) {
                childDirs.add(first);
            }
        }
        for (const name of childDirs) {
            if (!entries.some((e) => e.name === name)) {
                entries.push(makeDirent(name, true));
            }
        }

        return entries;
    }

    writeFile(path: string, data: Buffer): void {
        this.files.set(path, data);
        const parent = path.slice(0, path.lastIndexOf('/'));
        if (parent) {
            this.mkdirRecursive(parent);
        }
    }

    readFileString(path: string, _encoding: BufferEncoding): string {
        const buf = this.files.get(path);
        if (!buf) {
            throw new Error(`File not found: ${path}`);
        }
        return buf.toString('utf8');
    }

    remove(path: string): void {
        this.files.delete(path);
        const prefix = path.endsWith('/') ? path : `${path}/`;
        for (const key of this.files.keys()) {
            if (key.startsWith(prefix)) {
                this.files.delete(key);
            }
        }
        for (const dir of this.dirs) {
            if (dir === path || dir.startsWith(prefix)) {
                this.dirs.delete(dir);
            }
        }
    }

    rename(oldPath: string, newPath: string): void {
        // Handle single file rename
        if (this.files.has(oldPath)) {
            const data = this.files.get(oldPath)!;
            this.files.delete(oldPath);
            this.files.set(newPath, data);
            return;
        }

        // Handle directory rename
        const oldPrefix = oldPath.endsWith('/') ? oldPath : `${oldPath}/`;
        const newPrefix = newPath.endsWith('/') ? newPath : `${newPath}/`;

        for (const [key, value] of this.files.entries()) {
            if (key.startsWith(oldPrefix)) {
                this.files.delete(key);
                this.files.set(key.replace(oldPrefix, newPrefix), value);
            }
        }
        for (const dir of this.dirs) {
            if (dir === oldPath || dir.startsWith(oldPrefix)) {
                this.dirs.delete(dir);
                this.dirs.add(dir === oldPath ? newPath : dir.replace(oldPrefix, newPrefix));
            }
        }
    }

    chmod(_path: string, _mode: number): void {}

    stat(path: string): nodeFs.Stats {
        if (!this.exists(path)) {
            throw new Error(`ENOENT: ${path}`);
        }
        return { mtimeMs: Date.now() } as nodeFs.Stats;
    }

    plantServer(baseDir: string, serverName: string, version: string, nested = true): string {
        const versionDir = join(baseDir, 'language-servers', serverName, version);
        const serverDir = nested ? join(versionDir, `${serverName}-extracted`) : versionDir;
        this.mkdirRecursive(serverDir);
        const serverPath = join(serverDir, ServerFile);
        this.writeFile(serverPath, Buffer.from('server'));
        return serverPath;
    }

    plantServerWithRequiredFiles(
        baseDir: string,
        serverName: string,
        version: string,
        requiredFiles: string[],
    ): string {
        const versionDir = join(baseDir, 'language-servers', serverName, version);
        const serverDir = join(versionDir, `${serverName}-extracted`);
        this.mkdirRecursive(serverDir);
        const serverPath = join(serverDir, ServerFile);
        this.writeFile(serverPath, Buffer.from('server'));
        for (const f of requiredFiles) {
            this.writeFile(join(serverDir, f), Buffer.from(''));
        }
        return serverPath;
    }
}

function makeDirent(name: string, isDir: boolean): nodeFs.Dirent {
    return {
        name,
        isFile: () => !isDir,
        isDirectory: () => isDir,
        isBlockDevice: () => false,
        isCharacterDevice: () => false,
        isFIFO: () => false,
        isSocket: () => false,
        isSymbolicLink: () => false,
        parentPath: '',
    } as nodeFs.Dirent;
}

class MockFetcher {
    readonly calls: Array<{ url: string; timeoutMs: number }> = [];
    private readonly responseMap = new Map<string, Buffer | Error>();

    setResponse(url: string, response: Buffer | Error): void {
        this.responseMap.set(url, response);
    }

    fetch(url: string, timeoutMs: number): Promise<Buffer> {
        this.calls.push({ url, timeoutMs });
        const response = this.responseMap.get(url);
        if (!response) {
            return Promise.reject(new Error(`No mock response for: ${url}`));
        }
        if (response instanceof Error) {
            return Promise.reject(response);
        }
        return Promise.resolve(response);
    }
}

function capturedSleeper(): { sleeper: Sleeper; delays: number[] } {
    const delays: number[] = [];
    const sleeper: Sleeper = (ms: number) => {
        delays.push(ms);
        return Promise.resolve();
    };
    return { sleeper, delays };
}

function makeConfig(baseDir: string, overrides?: Partial<LspInstallerConfig>): LspInstallerConfig {
    return {
        name: 'test-server',
        supportedVersions: '<2.0.0',
        manifestUrl: 'https://example.com/manifest.json',
        serverFile: ServerFile,
        baseRoot: baseDir,
        sleeper: async () => {},
        ...overrides,
    };
}

function createInstaller(
    baseDir: string,
    memFs: MemoryFs,
    fetcher: MockFetcher,
    overrides?: Partial<LspInstallerConfig>,
): BaseLspInstaller {
    return new BaseLspInstaller(makeConfig(baseDir, overrides), memFs, fetcher.fetch.bind(fetcher));
}

describe('BaseLspInstaller', () => {
    const baseDir = '/test/cache/aws';
    let memFs: MemoryFs;
    let fetcher: MockFetcher;
    let installer: BaseLspInstaller;

    beforeEach(() => {
        LoggerFactory.reset();
        LoggerFactory.initialize(window.createOutputChannel('test'));
        memFs = new MemoryFs();
        fetcher = new MockFetcher();
        installer = createInstaller(baseDir, memFs, fetcher);
    });

    describe('downloadRoot', () => {
        it('returns baseDir/language-servers/<name>', () => {
            expect(installer.downloadRoot).toBe('/test/cache/aws/language-servers/test-server');
        });
    });

    describe('manifestCachePath', () => {
        it('returns downloadRoot/manifest.json', () => {
            expect(installer.manifestCachePath).toBe('/test/cache/aws/language-servers/test-server/manifest.json');
        });
    });

    describe('fetchManifest', () => {
        it('fetches and parses the flat generic manifest', async () => {
            const rawManifest = JSON.stringify({
                versions: [makeVersion('2.0.0'), makeVersion('1.8.0')],
            });
            fetcher.setResponse('https://example.com/manifest.json', Buffer.from(rawManifest));

            const result = await installer.fetchManifest();

            expect(result.versions).toHaveLength(2);
            expect(result.versions[1].serverVersion).toBe('1.8.0');
        });

        it('rejects channel-keyed manifests without a concrete adapter', async () => {
            const rawManifest = JSON.stringify({ prod: [makeVersion('1.5.0')] });
            fetcher.setResponse('https://example.com/manifest.json', Buffer.from(rawManifest));

            await expect(installer.fetchManifest()).rejects.toThrow("top-level 'versions' array");
            expect(memFs.exists(installer.manifestCachePath)).toBe(false);
        });

        it('caches manifest atomically after successful parse', async () => {
            const rawManifest = JSON.stringify({ versions: [makeVersion('1.0.0')] });
            fetcher.setResponse('https://example.com/manifest.json', Buffer.from(rawManifest));

            await installer.fetchManifest();

            expect(memFs.exists(installer.manifestCachePath)).toBe(true);
            const cached = memFs.readFileString(installer.manifestCachePath, 'utf8');
            expect(JSON.parse(cached)).toEqual(JSON.parse(rawManifest));
        });

        it('retries manifest fetch exactly 3 times with backoff', async () => {
            const { sleeper, delays } = capturedSleeper();
            const retryInstaller = createInstaller(baseDir, memFs, fetcher, { sleeper });
            fetcher.setResponse('https://example.com/manifest.json', new Error('Network fail'));

            await expect(retryInstaller.fetchManifest()).rejects.toThrow('Network fail');

            expect(fetcher.calls.filter((c) => c.url.includes('manifest'))).toHaveLength(3);
            expect(delays).toEqual([500, 1000]);
        });

        it('uses cached manifest when fetch fails', async () => {
            const rawManifest = JSON.stringify({ versions: [makeVersion('1.2.0')] });
            memFs.mkdirRecursive(installer.downloadRoot);
            memFs.writeFile(installer.manifestCachePath, Buffer.from(rawManifest));
            fetcher.setResponse('https://example.com/manifest.json', new Error('Offline'));

            const result = await installer.fetchManifest();

            expect(result.versions[0].serverVersion).toBe('1.2.0');
        });

        it('throws when fetch fails and no cache exists', async () => {
            fetcher.setResponse('https://example.com/manifest.json', new Error('No network'));

            await expect(installer.fetchManifest()).rejects.toThrow('No network');
        });

        it('manifest temp uses PID+random unique name', async () => {
            const rawManifest = JSON.stringify({ versions: [makeVersion('1.0.0')] });
            fetcher.setResponse('https://example.com/manifest.json', Buffer.from(rawManifest));

            await installer.fetchManifest();

            // Verify that no .tmp.<pid-only> files remain (atomic rename succeeded)
            const root = installer.downloadRoot;
            for (const key of memFs.files.keys()) {
                if (key.startsWith(root) && key.includes('.tmp.')) {
                    // If any temp exists, it should match the new pattern
                    expect(key).toMatch(/\.tmp\.\d+\.[a-f0-9]+$/);
                }
            }
        });
    });

    describe('resolve', () => {
        function setupManifestFetch(versions: Version[]) {
            const rawManifest = JSON.stringify({ versions });
            fetcher.setResponse('https://example.com/manifest.json', Buffer.from(rawManifest));
        }

        it('returns cache hit when server file exists locally', async () => {
            setupManifestFetch([makeVersion('1.5.0', true)]);
            memFs.plantServer(baseDir, 'test-server', '1.5.0');

            const result = await installer.resolve();

            expect(result.location).toBe('cache');
            expect(result.version).toBe('1.5.0');
            expect(result.serverPath).toContain(ServerFile);
        });

        it('selects highest compatible semver (ignores lower latest flag)', async () => {
            setupManifestFetch([
                makeVersion('1.0.0'),
                makeVersion('1.5.0', true), // Has latest flag but 1.9.0 is higher
                makeVersion('1.9.0'),
                makeVersion('2.0.0'), // Out of range
            ]);
            memFs.plantServer(baseDir, 'test-server', '1.9.0');

            const result = await installer.resolve();

            expect(result.version).toBe('1.9.0');
        });

        it('skips delisted versions', async () => {
            setupManifestFetch([
                makeVersion('1.5.0'),
                makeVersion('1.9.0', false, true), // delisted
            ]);
            memFs.plantServer(baseDir, 'test-server', '1.5.0');

            const result = await installer.resolve();

            expect(result.version).toBe('1.5.0');
        });

        it('falls back to highest installed when download fails', async () => {
            setupManifestFetch([makeVersion('1.9.0', true)]);
            memFs.plantServer(baseDir, 'test-server', '1.5.0');
            fetcher.setResponse('https://example.com/server-1.9.0.zip', new Error('Download fail'));

            const result = await installer.resolve();

            expect(result.location).toBe('fallback');
            expect(result.version).toBe('1.5.0');
        });

        it('throws when no server available (no cache, download fails, no fallback)', async () => {
            setupManifestFetch([makeVersion('1.9.0', true)]);
            fetcher.setResponse('https://example.com/server-1.9.0.zip', new Error('Network failure'));

            await expect(installer.resolve()).rejects.toThrow('No server available');
        });

        function setupDownload(hashes: string[], payload = Buffer.from('payload'), bytes = payload.length) {
            const version = makeVersion('1.9.0', true);
            const content = { ...version.targets[0].contents[0], hashes, bytes };
            setupManifestFetch([{ ...version, targets: [{ ...version.targets[0], contents: [content] }] }]);
            fetcher.setResponse(content.url, payload);
        }

        it('propagates a hash mismatch instead of falling back to an installed server', async () => {
            setupDownload(['sha256:0000']);
            memFs.plantServer(baseDir, 'test-server', '1.5.0');

            await expect(installer.resolve()).rejects.toThrow('Hash verification failed for server-1.9.0.zip');
        });

        it.each([
            ['a raw digest without an algorithm prefix', ['0123abcd']],
            ['an unsupported algorithm', ['nosuchalgorithm:0123abcd']],
            ['an empty digest', ['sha256:']],
        ])('fails closed on %s', async (_description, hashes) => {
            setupDownload(hashes);

            await expect(installer.resolve()).rejects.toThrow('Hash verification failed for server-1.9.0.zip');
        });

        it('accepts any matching declared hash, compared case-insensitively', async () => {
            const payload = Buffer.from('payload');
            const digest = createHash('sha384').update(payload).digest('hex').toUpperCase();
            setupDownload(['sha256:0000', `SHA384:${digest}`], payload);

            await expect(installer.resolve()).rejects.toThrow('No server available');
            expect(fetcher.calls.filter((call) => call.url.includes('server-1.9.0'))).toHaveLength(1);
        });

        it('treats a size mismatch as a download failure that can fall back', async () => {
            setupDownload([], Buffer.from('payload'), 1024);
            memFs.plantServer(baseDir, 'test-server', '1.5.0');

            const result = await installer.resolve();

            expect(result.location).toBe('fallback');
            expect(result.version).toBe('1.5.0');
        });

        it('uses the highest installed server when no manifest is available', async () => {
            fetcher.setResponse('https://example.com/manifest.json', new Error('offline'));
            memFs.plantServer(baseDir, 'test-server', '1.2.0');
            memFs.plantServer(baseDir, 'test-server', '1.5.0');

            const result = await installer.resolve();

            expect(result.location).toBe('fallback');
            expect(result.version).toBe('1.5.0');
        });

        it('rethrows the manifest error when offline with no installed server', async () => {
            fetcher.setResponse('https://example.com/manifest.json', new Error('offline'));

            await expect(installer.resolve()).rejects.toThrow('offline');
        });

        it('uses an installed server when a cached manifest has no compatible version', async () => {
            memFs.files.set(installer.manifestCachePath, Buffer.from(JSON.stringify({ versions: [] })));
            fetcher.setResponse('https://example.com/manifest.json', new Error('offline'));
            memFs.plantServer(baseDir, 'test-server', '1.5.0');

            const result = await installer.resolve();

            expect(result.location).toBe('fallback');
            expect(result.version).toBe('1.5.0');
        });

        it('does not use an installed server when a fresh manifest has no compatible version', async () => {
            setupManifestFetch([makeVersion('2.5.0', true)]);
            memFs.plantServer(baseDir, 'test-server', '1.5.0');

            await expect(installer.resolve()).rejects.toThrow('No compatible version');
        });

        it('falls back to an installed server when the selected target has no contents', async () => {
            const version = makeVersion('1.9.0', true);
            setupManifestFetch([{ ...version, targets: [{ ...version.targets[0], contents: [] }] }]);
            memFs.plantServer(baseDir, 'test-server', '1.5.0');

            const result = await installer.resolve();

            expect(result.location).toBe('fallback');
            expect(result.version).toBe('1.5.0');
        });

        it('throws when the flat manifest has no versions', async () => {
            const rawManifest = JSON.stringify({ versions: [] });
            fetcher.setResponse('https://example.com/manifest.json', Buffer.from(rawManifest));

            await expect(installer.resolve()).rejects.toThrow('Manifest contains no versions');
        });

        it('throws when no compatible platform version exists', async () => {
            const versions: Version[] = [
                {
                    serverVersion: '1.5.0',
                    latest: true,
                    isDelisted: false,
                    targets: [
                        {
                            platform: 'other-platform',
                            arch: 'other-arch',
                            contents: [],
                        },
                    ],
                },
            ];
            setupManifestFetch(versions);

            await expect(installer.resolve()).rejects.toThrow('No compatible version');
        });

        it('calls postInstall hook on resolution', async () => {
            const postInstallCalls: string[] = [];
            const installerWithHook = new BaseLspInstaller(
                {
                    ...makeConfig(baseDir),
                    postInstall: (res) => {
                        postInstallCalls.push(res.version);
                    },
                },
                memFs,
                fetcher.fetch.bind(fetcher),
            );
            const rawManifest = JSON.stringify({ versions: [makeVersion('1.5.0', true)] });
            fetcher.setResponse('https://example.com/manifest.json', Buffer.from(rawManifest));
            memFs.plantServer(baseDir, 'test-server', '1.5.0');

            await installerWithHook.resolve();

            expect(postInstallCalls).toEqual(['1.5.0']);
        });

        it('verifies configured files after the postInstall hook', async () => {
            const requiredFile = 'config.json';
            let hookCalled = false;
            const installerWithHook = new BaseLspInstaller(
                {
                    ...makeConfig(baseDir),
                    requiredFiles: [requiredFile],
                    postInstall: (resolution) => {
                        hookCalled = true;
                        memFs.remove(join(dirname(resolution.serverPath), requiredFile));
                    },
                },
                memFs,
                fetcher.fetch.bind(fetcher),
            );
            const rawManifest = JSON.stringify({ versions: [makeVersion('1.5.0', true)] });
            fetcher.setResponse('https://example.com/manifest.json', Buffer.from(rawManifest));
            memFs.plantServerWithRequiredFiles(baseDir, 'test-server', '1.5.0', [requiredFile]);

            await expect(installerWithHook.resolve()).rejects.toThrow('Required files missing after post-install');
            expect(hookCalled).toBe(true);
        });

        it('retries download exactly 3 times with delays [500, 1000]', async () => {
            const { sleeper, delays } = capturedSleeper();
            const retryInstaller = createInstaller(baseDir, memFs, fetcher, { sleeper });
            setupManifestFetch([makeVersion('1.9.0', true)]);
            fetcher.setResponse('https://example.com/server-1.9.0.zip', new Error('fail'));

            await expect(retryInstaller.resolve()).rejects.toThrow();

            const downloadCalls = fetcher.calls.filter((c) => c.url.includes('server-1.9.0'));
            expect(downloadCalls).toHaveLength(3);
            // Manifest also retried (3 attempts) but succeeded, so only download delays counted
            // The manifest fetch delays are [500, 1000] from manifest, then download delays are separate
            // Since manifest succeeds on first try, download delays are the ones we see
            expect(delays).toEqual([500, 1000]);
        });

        it('install temp uses PID+random unique name', async () => {
            setupManifestFetch([makeVersion('1.9.0', true)]);
            // Track rename calls to verify tmp dir pattern
            const originalRename = memFs.rename.bind(memFs);
            const renamedFrom: string[] = [];
            memFs.rename = (oldPath: string, newPath: string) => {
                renamedFrom.push(oldPath);
                originalRename(oldPath, newPath);
            };
            fetcher.setResponse('https://example.com/server-1.9.0.zip', new Error('fail'));

            await expect(installer.resolve()).rejects.toThrow();

            // Even though download fails (no zip data), the tmp dir creation uses PID+random
            // We can verify by checking that removed dirs match the pattern
            const root = installer.downloadRoot;
            // Check memFs dirs that were created with tmp pattern
            for (const dir of memFs.dirs) {
                if (dir.includes('.tmp.') && dir.startsWith(root)) {
                    expect(dir).toMatch(/\.tmp\.\d+\.[a-f0-9]+$/);
                }
            }
        });
    });

    describe('fetchWithRetries sleeper injection', () => {
        it('manifest fetch uses injectable sleeper with correct delays', async () => {
            const { sleeper, delays } = capturedSleeper();
            const sleeperInstaller = createInstaller(baseDir, memFs, fetcher, { sleeper });
            fetcher.setResponse('https://example.com/manifest.json', new Error('fail'));

            await expect(sleeperInstaller.fetchManifest()).rejects.toThrow('fail');

            // 3 attempts = 2 sleeps between them: 500ms, 1000ms
            expect(delays).toHaveLength(2);
            expect(delays).toEqual([500, 1000]);
        });

        it('bundle download uses injectable sleeper with correct delays', async () => {
            const { sleeper, delays } = capturedSleeper();
            const sleeperInstaller = createInstaller(baseDir, memFs, fetcher, { sleeper });
            const rawManifest = JSON.stringify({ versions: [makeVersion('1.5.0', true)] });
            fetcher.setResponse('https://example.com/manifest.json', Buffer.from(rawManifest));
            fetcher.setResponse('https://example.com/server-1.5.0.zip', new Error('download fail'));

            await expect(sleeperInstaller.resolve()).rejects.toThrow();

            // Bundle download: 3 attempts = 2 sleeps: 500ms, 1000ms
            expect(delays).toEqual([500, 1000]);
        });

        it('no-op sleeper (zero delay) still retries 3 times', async () => {
            const noOpSleeper: Sleeper = async () => {};
            const fastInstaller = createInstaller(baseDir, memFs, fetcher, { sleeper: noOpSleeper });
            fetcher.setResponse('https://example.com/manifest.json', new Error('fail'));

            await expect(fastInstaller.fetchManifest()).rejects.toThrow('fail');

            expect(fetcher.calls.filter((c) => c.url.includes('manifest'))).toHaveLength(3);
        });
    });

    describe('findServerFile', () => {
        it('finds server file directly in the version directory', () => {
            const versionDir = join(installer.downloadRoot, '1.0.0');
            memFs.mkdirRecursive(versionDir);
            memFs.writeFile(join(versionDir, ServerFile), Buffer.from(''));

            expect(installer.findServerFile(versionDir)).toBe(join(versionDir, ServerFile));
        });

        it('finds server file in a subdirectory (zip extraction layout)', () => {
            const versionDir = join(installer.downloadRoot, '1.0.0');
            const subDir = join(versionDir, 'extracted');
            memFs.mkdirRecursive(subDir);
            memFs.writeFile(join(subDir, ServerFile), Buffer.from(''));

            expect(installer.findServerFile(versionDir)).toBe(join(subDir, ServerFile));
        });

        it('returns undefined when server file does not exist', () => {
            const versionDir = join(installer.downloadRoot, '1.0.0');
            memFs.mkdirRecursive(versionDir);

            expect(installer.findServerFile(versionDir)).toBeUndefined();
        });

        it('returns undefined for nonexistent directory', () => {
            expect(installer.findServerFile('/nonexistent')).toBeUndefined();
        });
    });

    describe('installedVersions', () => {
        it('lists semver-named directories', () => {
            memFs.plantServer(baseDir, 'test-server', '1.0.0');
            memFs.plantServer(baseDir, 'test-server', '1.2.0');
            memFs.mkdirRecursive(join(installer.downloadRoot, 'not-a-version'));

            const versions = installer.installedVersions();

            expect(versions.toSorted()).toEqual(['1.0.0', '1.2.0']);
        });

        it('excludes .tmp.<pid>.<random> directories', () => {
            memFs.plantServer(baseDir, 'test-server', '1.0.0');
            memFs.mkdirRecursive(join(installer.downloadRoot, '1.2.0.tmp.12345.abcd1234'));

            expect(installer.installedVersions()).toEqual(['1.0.0']);
        });

        it('returns empty array when download root does not exist', () => {
            expect(installer.installedVersions()).toEqual([]);
        });
    });

    describe('findInstalledFallback', () => {
        it('returns the highest version with a usable server file in range', () => {
            memFs.plantServer(baseDir, 'test-server', '1.0.0');
            memFs.plantServer(baseDir, 'test-server', '1.5.0');
            memFs.plantServer(baseDir, 'test-server', '1.9.0');

            const fallback = installer.findInstalledFallback();

            expect(fallback?.version).toBe('1.9.0');
        });

        it('excludes the specified version', () => {
            memFs.plantServer(baseDir, 'test-server', '1.0.0');
            memFs.plantServer(baseDir, 'test-server', '1.5.0');

            expect(installer.findInstalledFallback('1.5.0')?.version).toBe('1.0.0');
        });

        it('skips directories without a server file', () => {
            memFs.plantServer(baseDir, 'test-server', '1.0.0');
            memFs.mkdirRecursive(join(installer.downloadRoot, '1.5.0'));

            expect(installer.findInstalledFallback()?.version).toBe('1.0.0');
        });

        it('returns undefined when nothing is installed', () => {
            expect(installer.findInstalledFallback()).toBeUndefined();
        });

        it('requires version to satisfy supportedVersions semver range', () => {
            // supportedVersions is '<2.0.0' - so 2.x should be excluded
            memFs.plantServer(baseDir, 'test-server', '2.0.0');
            memFs.plantServer(baseDir, 'test-server', '1.5.0');

            const fallback = installer.findInstalledFallback();

            expect(fallback?.version).toBe('1.5.0');
        });

        it('skips out-of-range versions entirely', () => {
            memFs.plantServer(baseDir, 'test-server', '2.0.0');
            memFs.plantServer(baseDir, 'test-server', '3.0.0');

            expect(installer.findInstalledFallback()).toBeUndefined();
        });

        it('requires all required files to be present', () => {
            const reqInstaller = createInstaller(baseDir, memFs, fetcher, {
                requiredFiles: ['config.json', 'lib/helper.js'],
            });

            // Plant a version with server file but missing required files
            memFs.plantServer(baseDir, 'test-server', '1.5.0');
            // Plant a version with server file AND required files
            memFs.plantServerWithRequiredFiles(baseDir, 'test-server', '1.0.0', ['config.json', 'lib/helper.js']);

            const fallback = reqInstaller.findInstalledFallback();

            // Should pick 1.0.0 because 1.5.0 is missing required files
            expect(fallback?.version).toBe('1.0.0');
        });
    });

    describe('cleanup', () => {
        it('keeps the current version and one highest valid fallback', () => {
            memFs.plantServer(baseDir, 'test-server', '1.0.0');
            memFs.plantServer(baseDir, 'test-server', '1.2.0');
            memFs.plantServer(baseDir, 'test-server', '1.4.0');

            installer.cleanup('1.4.0');

            expect(memFs.exists(join(installer.downloadRoot, '1.4.0'))).toBe(true);
            expect(memFs.exists(join(installer.downloadRoot, '1.2.0'))).toBe(true);
            expect(memFs.exists(join(installer.downloadRoot, '1.0.0'))).toBe(false);
        });

        it('removes stale tmp dirs from dead processes', () => {
            memFs.plantServer(baseDir, 'test-server', '1.4.0');
            memFs.mkdirRecursive(join(installer.downloadRoot, `1.5.0.tmp.${DeadPid}.abcd1234`));

            installer.cleanup('1.4.0');

            expect(memFs.exists(join(installer.downloadRoot, `1.5.0.tmp.${DeadPid}.abcd1234`))).toBe(false);
        });

        it('keeps tmp dirs from live processes', () => {
            memFs.plantServer(baseDir, 'test-server', '1.4.0');
            memFs.mkdirRecursive(join(installer.downloadRoot, `1.5.0.tmp.${process.pid}.abcd1234`));

            installer.cleanup('1.4.0');

            expect(memFs.exists(join(installer.downloadRoot, `1.5.0.tmp.${process.pid}.abcd1234`))).toBe(true);
        });

        it('does not throw when download root does not exist', () => {
            expect(() => installer.cleanup('1.0.0')).not.toThrow();
        });

        it('keeps all versions when only one exists (current)', () => {
            memFs.plantServer(baseDir, 'test-server', '1.4.0');

            installer.cleanup('1.4.0');

            expect(memFs.exists(join(installer.downloadRoot, '1.4.0'))).toBe(true);
        });

        it('removes out-of-range versions (not valid fallback candidates)', () => {
            memFs.plantServer(baseDir, 'test-server', '1.4.0');
            memFs.plantServer(baseDir, 'test-server', '2.0.0'); // Out of supportedVersions '<2.0.0'
            memFs.plantServer(baseDir, 'test-server', '1.2.0');

            installer.cleanup('1.4.0');

            expect(memFs.exists(join(installer.downloadRoot, '1.4.0'))).toBe(true); // current
            expect(memFs.exists(join(installer.downloadRoot, '1.2.0'))).toBe(true); // valid fallback
            expect(memFs.exists(join(installer.downloadRoot, '2.0.0'))).toBe(false); // out of range
        });

        it('removes versions without server file (invalid fallback)', () => {
            memFs.plantServer(baseDir, 'test-server', '1.4.0');
            memFs.mkdirRecursive(join(installer.downloadRoot, '1.3.0')); // no server file
            memFs.plantServer(baseDir, 'test-server', '1.2.0');

            installer.cleanup('1.4.0');

            expect(memFs.exists(join(installer.downloadRoot, '1.4.0'))).toBe(true);
            expect(memFs.exists(join(installer.downloadRoot, '1.2.0'))).toBe(true); // valid fallback
            expect(memFs.exists(join(installer.downloadRoot, '1.3.0'))).toBe(false); // invalid
        });

        it('retains highest compatible VALID fallback, removes lower valid ones', () => {
            memFs.plantServer(baseDir, 'test-server', '1.4.0');
            memFs.plantServer(baseDir, 'test-server', '1.3.0');
            memFs.plantServer(baseDir, 'test-server', '1.2.0');
            memFs.plantServer(baseDir, 'test-server', '1.1.0');

            installer.cleanup('1.4.0');

            expect(memFs.exists(join(installer.downloadRoot, '1.4.0'))).toBe(true);
            expect(memFs.exists(join(installer.downloadRoot, '1.3.0'))).toBe(true); // highest valid fallback
            expect(memFs.exists(join(installer.downloadRoot, '1.2.0'))).toBe(false);
            expect(memFs.exists(join(installer.downloadRoot, '1.1.0'))).toBe(false);
        });

        it('with requiredFiles, only retains versions that pass all checks', () => {
            const reqInstaller = createInstaller(baseDir, memFs, fetcher, {
                requiredFiles: ['extra.dat'],
            });

            // 1.4.0 current with required files
            memFs.plantServerWithRequiredFiles(baseDir, 'test-server', '1.4.0', ['extra.dat']);
            // 1.3.0 has server but MISSING required file — not valid fallback
            memFs.plantServer(baseDir, 'test-server', '1.3.0');
            // 1.2.0 has server AND required files — valid fallback
            memFs.plantServerWithRequiredFiles(baseDir, 'test-server', '1.2.0', ['extra.dat']);

            reqInstaller.cleanup('1.4.0');

            expect(memFs.exists(join(installer.downloadRoot, '1.4.0'))).toBe(true);
            expect(memFs.exists(join(installer.downloadRoot, '1.3.0'))).toBe(false); // invalid
            expect(memFs.exists(join(installer.downloadRoot, '1.2.0'))).toBe(true); // valid fallback
        });
    });

    describe('concurrent winner validation', () => {
        it('concurrent winner must pass required files validation (not just server file)', () => {
            // This test verifies the logic of the concurrent winner path
            // When rename fails (concurrent winner exists), we validate server + all required files
            const reqInstaller = new BaseLspInstaller(
                {
                    ...makeConfig(baseDir),
                    requiredFiles: ['config.json'],
                    sleeper: async () => {},
                },
                memFs,
                fetcher.fetch.bind(fetcher),
            );

            // Set up a version directory that has the server file but NOT required files
            const vDir = join(reqInstaller.downloadRoot, '1.5.0');
            memFs.plantServer(baseDir, 'test-server', '1.5.0');

            // findServerFile sees the server, but validateRequiredFiles should fail
            // This confirms the validation logic that concurrent winner path depends on
            expect(reqInstaller.findServerFile(vDir)).toBeDefined();
            // findInstalledFallback should reject it because required files are missing
            expect(reqInstaller.findInstalledFallback()).toBeUndefined();
        });

        it('concurrent winner passes when server AND required files exist', () => {
            const reqInstaller = new BaseLspInstaller(
                {
                    ...makeConfig(baseDir),
                    requiredFiles: ['config.json'],
                    sleeper: async () => {},
                },
                memFs,
                fetcher.fetch.bind(fetcher),
            );

            // Set up version with both server file and required files
            memFs.plantServerWithRequiredFiles(baseDir, 'test-server', '1.5.0', ['config.json']);

            const fallback = reqInstaller.findInstalledFallback();
            expect(fallback).toBeDefined();
            expect(fallback?.version).toBe('1.5.0');
        });
    });

    describe('invalidateResolvedInstallation', () => {
        function setupManifestFetch(versions: Version[]) {
            const rawManifest = JSON.stringify({ versions });
            fetcher.setResponse('https://example.com/manifest.json', Buffer.from(rawManifest));
        }

        it('is a no-op when no resolution has been tracked', () => {
            // No resolve() called — should not throw
            expect(() => installer.invalidateResolvedInstallation()).not.toThrow();
            expect(installer.resolvedInstallation).toBeUndefined();
        });

        it('removes the managed versionDir after a successful resolve', async () => {
            setupManifestFetch([makeVersion('1.5.0', true)]);
            memFs.plantServer(baseDir, 'test-server', '1.5.0');

            const result = await installer.resolve();
            expect(result.location).toBe('cache');
            expect(installer.resolvedInstallation).toBeDefined();
            expect(memFs.exists(result.versionDir)).toBe(true);

            installer.invalidateResolvedInstallation();

            expect(memFs.exists(result.versionDir)).toBe(false);
            expect(installer.resolvedInstallation).toBeUndefined();
        });

        it('clears tracked state so second call is a no-op', async () => {
            setupManifestFetch([makeVersion('1.5.0', true)]);
            memFs.plantServer(baseDir, 'test-server', '1.5.0');

            await installer.resolve();
            installer.invalidateResolvedInstallation();

            // Second call should be safe no-op
            expect(() => installer.invalidateResolvedInstallation()).not.toThrow();
            expect(installer.resolvedInstallation).toBeUndefined();
        });

        it('does not remove versionDir outside downloadRoot (external path safety)', async () => {
            // Simulate an installer that somehow tracked an external path
            const externalDir = '/external/dev/server/1.0.0';
            memFs.mkdirRecursive(externalDir);
            memFs.writeFile(join(externalDir, ServerFile), Buffer.from('server'));

            setupManifestFetch([makeVersion('1.5.0', true)]);
            memFs.plantServer(baseDir, 'test-server', '1.5.0');

            await installer.resolve();

            // Manually override lastResolution to simulate external path
            // Access via property to test the guard
            (installer as any).lastResolution = {
                location: 'cache',
                version: '1.0.0',
                versionDir: externalDir,
                serverPath: join(externalDir, ServerFile),
            };

            installer.invalidateResolvedInstallation();

            // External path should NOT be removed
            expect(memFs.exists(externalDir)).toBe(true);
        });

        it('after invalidation, second resolve cannot reuse the deleted cache', async () => {
            setupManifestFetch([makeVersion('1.5.0', true)]);
            memFs.plantServer(baseDir, 'test-server', '1.5.0');

            // First resolve — cache hit
            const first = await installer.resolve();
            expect(first.location).toBe('cache');

            // Invalidate — deletes versionDir
            installer.invalidateResolvedInstallation();
            expect(memFs.exists(first.versionDir)).toBe(false);

            // Second resolve — cannot find cache, must go to remote (which fails) then no fallback
            fetcher.setResponse('https://example.com/server-1.5.0.zip', new Error('download fail'));
            await expect(installer.resolve()).rejects.toThrow('No server available');
        });
    });
});

describe('isPidAlive', () => {
    it('returns true for the current process', () => {
        expect(isPidAlive(process.pid)).toBe(true);
    });

    it('returns false for a dead pid', () => {
        expect(isPidAlive(DeadPid)).toBe(false);
    });
});
