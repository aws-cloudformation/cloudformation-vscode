import nodeFs from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, beforeEach, afterEach, it, expect, vi } from 'vitest';
import { window } from 'vscode';
import { FetchBuffer, FileSystem } from '../../../src/lsp-server/installer/BaseLspInstaller';
import {
    CfnLspInstaller,
    createCfnManifestAdapter,
    NodeFileSystem,
    withExecutableBits,
} from '../../../src/lsp-server/installer/CfnLspInstaller';
import { LoggerFactory } from '../../../src/utils/Logger';

vi.mock('vscode');

const CfnServerFile = 'cfn-lsp-server-standalone.js';

function plantValidBundle(bundleDir: string): void {
    nodeFs.mkdirSync(join(bundleDir, 'bin'), { recursive: true });
    nodeFs.mkdirSync(join(bundleDir, 'node_modules'), { recursive: true });
    nodeFs.writeFileSync(join(bundleDir, CfnServerFile), '');
}

describe('CfnLspInstaller', () => {
    let testDir: string;
    let installer: CfnLspInstaller;

    beforeEach(() => {
        LoggerFactory.reset();
        LoggerFactory.initialize(window.createOutputChannel('test', { log: true }));
        testDir = nodeFs.mkdtempSync(join(tmpdir(), 'cfn-installer-test-'));
        installer = new CfnLspInstaller(testDir, 'prod', undefined, undefined, async () => {});
    });

    afterEach(() => {
        nodeFs.rmSync(testDir, { recursive: true, force: true });
    });

    describe('configuration', () => {
        it('uses cloudformation-languageserver as server name', () => {
            expect(installer.downloadRoot).toBe(join(testDir, 'language-servers', 'cloudformation-languageserver'));
        });

        it('uses cfn-lsp-server-standalone.js as the required file', () => {
            const versionDir = join(installer.downloadRoot, '1.0.0');
            nodeFs.mkdirSync(versionDir, { recursive: true });
            nodeFs.writeFileSync(join(versionDir, CfnServerFile), '');

            expect(installer.findServerFile(versionDir)).toBe(join(versionDir, CfnServerFile));
        });

        it('manifests are cached in the download root', () => {
            expect(installer.manifestCachePath).toBe(
                join(testDir, 'language-servers', 'cloudformation-languageserver', 'manifest.json'),
            );
        });

        it('selects the requested environment in the concrete CFN adapter', () => {
            const version = {
                serverVersion: '1.5.0',
                latest: true,
                isDelisted: false,
                targets: [],
            };
            const manifest = createCfnManifestAdapter('prod')({
                alpha: [{ ...version, serverVersion: '1.6.0-alpha' }],
                prod: [version],
            });

            expect(manifest.versions.map((item) => item.serverVersion)).toEqual(['1.5.0']);
        });

        it('requires the requested channel array instead of falling back to top-level versions', () => {
            const adapter = createCfnManifestAdapter('beta');

            expect(() => adapter({ versions: [], prod: [] })).toThrow(
                "Manifest contains no versions for environment 'beta'",
            );
        });

        it('rejects a manifest that is not an object', () => {
            expect(() => createCfnManifestAdapter('prod')(null)).toThrow(
                "Manifest contains no versions for environment 'prod'",
            );
        });
    });

    describe('resolve with cache hit', () => {
        it('returns cache hit when server file exists', async () => {
            const versionDir = join(installer.downloadRoot, '1.5.0');
            const extractDir = join(versionDir, 'cfn-lsp-extracted');
            plantValidBundle(extractDir);

            // Pre-cache the manifest so it doesn't need network
            nodeFs.mkdirSync(installer.downloadRoot, { recursive: true });
            const manifest = {
                prod: [
                    {
                        serverVersion: '1.5.0',
                        latest: true,
                        isDelisted: false,
                        targets: [
                            {
                                platform: process.platform,
                                arch: process.arch,
                                contents: [{ filename: 'cfn.zip', url: 'http://x', hashes: [], bytes: 1 }],
                            },
                        ],
                    },
                ],
            };
            nodeFs.writeFileSync(installer.manifestCachePath, JSON.stringify(manifest));

            // Use a fetcher that fails (to prove we use cache)
            const offlineInstaller = new CfnLspInstaller(
                testDir,
                'prod',
                undefined,
                () => Promise.reject(new Error('offline')),
                async () => {},
            );

            const result = await offlineInstaller.resolve();

            expect(result.location).toBe('cache');
            expect(result.version).toBe('1.5.0');
        });
    });

    describe('postInstall', () => {
        it('creates executable cfn-init for non-windows platforms', async () => {
            if (process.platform === 'win32') {
                return;
            }

            const versionDir = join(installer.downloadRoot, '1.5.0');
            const extractDir = join(versionDir, 'cfn-lsp-extracted');
            const binDir = join(extractDir, 'bin');
            plantValidBundle(extractDir);
            nodeFs.writeFileSync(join(binDir, 'cfn-init'), '#!/bin/sh\n');

            // Pre-cache manifest
            nodeFs.mkdirSync(installer.downloadRoot, { recursive: true });
            const manifest = {
                prod: [
                    {
                        serverVersion: '1.5.0',
                        latest: true,
                        isDelisted: false,
                        targets: [
                            {
                                platform: process.platform,
                                arch: process.arch,
                                contents: [{ filename: 'cfn.zip', url: 'http://x', hashes: [], bytes: 1 }],
                            },
                        ],
                    },
                ],
            };
            nodeFs.writeFileSync(installer.manifestCachePath, JSON.stringify(manifest));

            const offlineInstaller = new CfnLspInstaller(
                testDir,
                'prod',
                undefined,
                () => Promise.reject(new Error('offline')),
                async () => {},
            );

            await offlineInstaller.resolve();

            const stats = nodeFs.statSync(join(binDir, 'cfn-init'));
            expect(stats.mode & 0o755).toBe(0o755);
        });
    });

    describe('withExecutableBits', () => {
        it('adds execute for owner, group, and others while keeping read/write bits', () => {
            expect(withExecutableBits(0o600)).toBe(0o711);
            expect(withExecutableBits(0o644)).toBe(0o755);
        });

        it('is idempotent when execute bits are already set', () => {
            expect(withExecutableBits(0o755)).toBe(0o755);
        });

        it('drops the file-type bits reported by stat() so only permission bits reach chmod', () => {
            const regularFile = 0o100_000;
            expect(withExecutableBits(regularFile | 0o640)).toBe(0o751);
        });
    });

    describe('fallback', () => {
        it('falls back to highest installed version', () => {
            const v1Dir = join(installer.downloadRoot, '1.0.0');
            const v2Dir = join(installer.downloadRoot, '1.5.0');
            plantValidBundle(v1Dir);
            plantValidBundle(v2Dir);

            const fallback = installer.findInstalledFallback();

            expect(fallback?.version).toBe('1.5.0');
        });
    });

    describe('cleanup', () => {
        it('retains current plus one fallback', () => {
            const versions = ['1.0.0', '1.2.0', '1.4.0'];
            for (const v of versions) {
                plantValidBundle(join(installer.downloadRoot, v));
            }

            installer.cleanup('1.4.0');

            expect(nodeFs.existsSync(join(installer.downloadRoot, '1.4.0'))).toBe(true);
            expect(nodeFs.existsSync(join(installer.downloadRoot, '1.2.0'))).toBe(true);
            expect(nodeFs.existsSync(join(installer.downloadRoot, '1.0.0'))).toBe(false);
        });
    });

    describe('dependency injection', () => {
        it('accepts custom fs and fetcher', () => {
            const customFs: FileSystem = new NodeFileSystem();
            const customFetcher: FetchBuffer = vi.fn().mockResolvedValue(Buffer.from(''));

            const customInstaller = new CfnLspInstaller(testDir, 'prod', customFs, customFetcher);
            expect(customInstaller.downloadRoot).toBe(
                join(testDir, 'language-servers', 'cloudformation-languageserver'),
            );
        });
    });
});
