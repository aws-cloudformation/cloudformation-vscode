import nodeFs from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, beforeEach, afterEach, it, expect, vi } from 'vitest';
import { window } from 'vscode';
import { CfnRemoteLspServerProvider } from '../../src/lsp-server/CfnRemoteLspServerProvider';
import { CfnLspInstaller } from '../../src/lsp-server/installer/CfnLspInstaller';
import { LspResolver } from '../../src/lsp-server/LspLauncher';
import { LspServerResolver } from '../../src/lsp-server/LspServerProvider';
import { LoggerFactory } from '../../src/utils/Logger';

vi.mock('vscode');

const CfnServerFile = 'cfn-lsp-server-standalone.js';

function plantValidBundle(bundleDir: string, serverContents = ''): void {
    nodeFs.mkdirSync(join(bundleDir, 'bin'), { recursive: true });
    nodeFs.mkdirSync(join(bundleDir, 'node_modules'), { recursive: true });
    nodeFs.writeFileSync(join(bundleDir, CfnServerFile), serverContents);
}

describe('CfnRemoteLspServerProvider', () => {
    let testDir: string;

    beforeEach(() => {
        LoggerFactory.reset();
        LoggerFactory.initialize(window.createOutputChannel('test'));
        testDir = nodeFs.mkdtempSync(join(tmpdir(), 'cfn-remote-provider-test-'));
    });

    afterEach(() => {
        nodeFs.rmSync(testDir, { recursive: true, force: true });
    });

    function plantVersionWithManifest(version: string): string {
        const installer = new CfnLspInstaller(testDir, 'prod', undefined, undefined, async () => {});
        const versionDir = join(installer.downloadRoot, version);
        const extractDir = join(versionDir, 'cfn-lsp-extracted');
        plantValidBundle(extractDir);

        // Cache the manifest
        nodeFs.mkdirSync(installer.downloadRoot, { recursive: true });
        const manifest = {
            prod: [
                {
                    serverVersion: version,
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

        return versionDir;
    }

    it('invalidate() removes the resolved versionDir from disk', async () => {
        const versionDir = plantVersionWithManifest('1.5.0');

        const installer = new CfnLspInstaller(
            testDir,
            'prod',
            undefined,
            () => Promise.reject(new Error('offline')),
            async () => {},
        );
        const provider = new CfnRemoteLspServerProvider('prod', installer);

        // First resolve succeeds via cache
        const serverPath = await provider.serverExecutable();
        expect(serverPath).toContain(CfnServerFile);
        expect(nodeFs.existsSync(versionDir)).toBe(true);

        // Invalidate removes the versionDir
        provider.invalidate();
        expect(nodeFs.existsSync(versionDir)).toBe(false);
    });

    it('after invalidation, second serverExecutable() re-resolves fresh', async () => {
        plantVersionWithManifest('1.5.0');

        const installer = new CfnLspInstaller(
            testDir,
            'prod',
            undefined,
            () => Promise.reject(new Error('offline')),
            async () => {},
        );
        const provider = new CfnRemoteLspServerProvider('prod', installer);

        // First resolve
        await provider.serverExecutable();

        // Invalidate (removes versionDir)
        provider.invalidate();

        // Second resolve should fail because versionDir is gone and download is offline
        await expect(provider.serverExecutable()).rejects.toThrow();
    });

    it('invalidate() is safe to call before any resolution', () => {
        const installer = new CfnLspInstaller(
            testDir,
            'prod',
            undefined,
            () => Promise.reject(new Error('offline')),
            async () => {},
        );
        const provider = new CfnRemoteLspServerProvider('prod', installer);

        // Should not throw
        expect(() => provider.invalidate()).not.toThrow();
    });
});

describe('Installer → Provider → Launcher integration: failed managed path is deleted on retry', () => {
    let testDir: string;

    beforeEach(() => {
        LoggerFactory.reset();
        LoggerFactory.initialize(window.createOutputChannel('test'));
        testDir = nodeFs.mkdtempSync(join(tmpdir(), 'cfn-integration-test-'));
    });

    afterEach(() => {
        nodeFs.rmSync(testDir, { recursive: true, force: true });
    });

    it('first start failure triggers invalidation that deletes managed versionDir; retry cannot reuse it', async () => {
        // Plant a cached version so the installer resolves from cache
        const installer = new CfnLspInstaller(testDir, 'prod', undefined, undefined, async () => {});
        const versionDir = join(installer.downloadRoot, '1.5.0');
        const extractDir = join(versionDir, 'cfn-lsp-extracted');
        plantValidBundle(extractDir, '// server');

        // Cache the manifest
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

        // Create the provider with an offline fetcher (downloads always fail)
        const offlineInstaller = new CfnLspInstaller(
            testDir,
            'prod',
            undefined,
            () => Promise.reject(new Error('offline')),
            async () => {},
        );
        const provider = new CfnRemoteLspServerProvider('prod', offlineInstaller);

        // Build the LspResolver that wraps provider + serverResolver
        const serverResolver = new LspServerResolver([provider]);

        const resolver: LspResolver = {
            resolve: async () => await serverResolver.serverExecutable(),
            invalidate: () => {
                serverResolver.resetResolution();
                provider.invalidate();
            },
        };

        // First resolve succeeds — versionDir exists on disk
        expect(nodeFs.existsSync(versionDir)).toBe(true);
        const firstPath = await resolver.resolve();
        expect(firstPath).toContain(CfnServerFile);

        // Simulate what LspLauncher does on start failure: invalidate()
        resolver.invalidate();

        // The managed versionDir should now be gone
        expect(nodeFs.existsSync(versionDir)).toBe(false);

        // Second resolve CANNOT reuse the deleted cache — should throw
        // (fetcher is offline, so remote download fails; no fallback available)
        await expect(resolver.resolve()).rejects.toThrow();
    });
});
