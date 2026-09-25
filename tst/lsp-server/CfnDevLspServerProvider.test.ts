import nodeFs from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, beforeEach, afterEach, it, expect, vi } from 'vitest';
import { window } from 'vscode';
import { CfnDevLspServerProvider } from '../../src/lsp-server/CfnDevLspServerProvider';
import { CfnLspServerFile } from '../../src/lsp-server/LspServerProvider';
import { LoggerFactory } from '../../src/utils/Logger';

vi.mock('vscode');

describe('CfnDevLspServerProvider', () => {
    let testDir: string;
    const originalEnv = { ...process.env };

    beforeEach(() => {
        LoggerFactory.reset();
        LoggerFactory.initialize(window.createOutputChannel('test'));
        testDir = nodeFs.mkdtempSync(join(tmpdir(), 'cfn-dev-test-'));
    });

    afterEach(() => {
        nodeFs.rmSync(testDir, { recursive: true, force: true });
        process.env = { ...originalEnv };
    });

    function makeExtensionContext(extensionPath: string) {
        return { extensionPath } as any;
    }

    function plantDevServer(parentDir: string, siblingName: string): string {
        const serverPath = join(parentDir, siblingName, 'bundle', 'development', CfnLspServerFile);
        nodeFs.mkdirSync(join(parentDir, siblingName, 'bundle', 'development'), { recursive: true });
        nodeFs.writeFileSync(serverPath, '');
        return serverPath;
    }

    describe('environment restriction', () => {
        it('canProvide returns false in production (AWS_ENV=prod, NODE_ENV unset)', () => {
            process.env.AWS_ENV = 'prod';
            delete process.env.NODE_ENV;
            delete process.env.CFN_LSP_ENVIRONMENT;
            delete process.env.CFN_LSP_SERVER_PATH;

            const provider = new CfnDevLspServerProvider(makeExtensionContext(testDir));

            expect(provider.canProvide()).toBe(false);
        });

        it('canProvide returns false when both AWS_ENV and NODE_ENV are unset', () => {
            delete process.env.AWS_ENV;
            delete process.env.NODE_ENV;
            delete process.env.CFN_LSP_ENVIRONMENT;
            delete process.env.CFN_LSP_SERVER_PATH;

            const provider = new CfnDevLspServerProvider(makeExtensionContext(testDir));

            expect(provider.canProvide()).toBe(false);
        });

        it('canProvide returns false in production (NODE_ENV=production)', () => {
            process.env.NODE_ENV = 'production';
            process.env.AWS_ENV = 'prod';
            delete process.env.CFN_LSP_ENVIRONMENT;
            delete process.env.CFN_LSP_SERVER_PATH;

            const provider = new CfnDevLspServerProvider(makeExtensionContext(testDir));

            expect(provider.canProvide()).toBe(false);
        });

        it('canProvide returns true in alpha environment', () => {
            process.env.NODE_ENV = 'production';
            process.env.AWS_ENV = 'alpha';
            delete process.env.CFN_LSP_SERVER_PATH;

            const extensionDir = join(testDir, 'extension');
            nodeFs.mkdirSync(extensionDir, { recursive: true });
            plantDevServer(testDir, 'cfn-lsp-server');

            const provider = new CfnDevLspServerProvider(makeExtensionContext(extensionDir));

            expect(provider.canProvide()).toBe(true);
        });

        it('canProvide returns true with CFN_LSP_ENVIRONMENT=alpha', () => {
            process.env.CFN_LSP_ENVIRONMENT = 'alpha';
            process.env.AWS_ENV = 'prod';
            delete process.env.CFN_LSP_SERVER_PATH;

            const extensionDir = join(testDir, 'extension');
            nodeFs.mkdirSync(extensionDir, { recursive: true });
            plantDevServer(testDir, 'cfn-lsp-server');

            const provider = new CfnDevLspServerProvider(makeExtensionContext(extensionDir));

            expect(provider.canProvide()).toBe(true);
        });

        it('canProvide returns true in NODE_ENV=test', () => {
            process.env.NODE_ENV = 'test';
            delete process.env.AWS_ENV;
            delete process.env.CFN_LSP_SERVER_PATH;

            const extensionDir = join(testDir, 'extension');
            nodeFs.mkdirSync(extensionDir, { recursive: true });
            plantDevServer(testDir, 'cfn-lsp-server');

            const provider = new CfnDevLspServerProvider(makeExtensionContext(extensionDir));

            expect(provider.canProvide()).toBe(true);
        });

        it('canProvide returns true in NODE_ENV=development', () => {
            process.env.NODE_ENV = 'development';
            delete process.env.AWS_ENV;
            delete process.env.CFN_LSP_SERVER_PATH;

            const extensionDir = join(testDir, 'extension');
            nodeFs.mkdirSync(extensionDir, { recursive: true });
            plantDevServer(testDir, 'cfn-lsp-server');

            const provider = new CfnDevLspServerProvider(makeExtensionContext(extensionDir));

            expect(provider.canProvide()).toBe(true);
        });
    });

    describe('explicit path via CFN_LSP_SERVER_PATH', () => {
        it('uses the explicit path when set and exists', () => {
            process.env.NODE_ENV = 'test';
            const serverPath = join(testDir, 'custom', CfnLspServerFile);
            nodeFs.mkdirSync(join(testDir, 'custom'), { recursive: true });
            nodeFs.writeFileSync(serverPath, '');
            process.env.CFN_LSP_SERVER_PATH = serverPath;

            const provider = new CfnDevLspServerProvider(makeExtensionContext(join(testDir, 'extension')));

            expect(provider.canProvide()).toBe(true);
            return expect(provider.serverExecutable()).resolves.toBe(serverPath);
        });

        it('falls through to walk-up when explicit path does not exist', () => {
            process.env.NODE_ENV = 'test';
            process.env.CFN_LSP_SERVER_PATH = '/nonexistent/path/server.js';

            // Plant a server that walk-up should find
            const extensionDir = join(testDir, 'extension');
            nodeFs.mkdirSync(extensionDir, { recursive: true });
            const expectedPath = plantDevServer(testDir, 'cfn-lsp-server');

            const provider = new CfnDevLspServerProvider(makeExtensionContext(extensionDir));

            expect(provider.canProvide()).toBe(true);
            return expect(provider.serverExecutable()).resolves.toBe(expectedPath);
        });

        it('canProvide returns false when explicit path invalid and no walk-up found', () => {
            process.env.NODE_ENV = 'test';
            process.env.CFN_LSP_SERVER_PATH = '/nonexistent/path/server.js';

            // No dev server planted
            const extensionDir = join(testDir, 'extension');
            nodeFs.mkdirSync(extensionDir, { recursive: true });

            const provider = new CfnDevLspServerProvider(makeExtensionContext(extensionDir));

            expect(provider.canProvide()).toBe(false);
        });
    });

    describe('bounded walk-up discovery', () => {
        it('finds server in a sibling directory', () => {
            process.env.NODE_ENV = 'test';
            delete process.env.CFN_LSP_SERVER_PATH;

            const extensionDir = join(testDir, 'extension');
            nodeFs.mkdirSync(extensionDir, { recursive: true });
            const expectedPath = plantDevServer(testDir, 'cfn-lsp-server');

            const provider = new CfnDevLspServerProvider(makeExtensionContext(extensionDir));

            expect(provider.canProvide()).toBe(true);
            return expect(provider.serverExecutable()).resolves.toBe(expectedPath);
        });

        it('does not find server beyond max walk depth', () => {
            process.env.NODE_ENV = 'test';
            delete process.env.CFN_LSP_SERVER_PATH;

            const deepDir = join(testDir, 'a', 'b', 'c', 'd', 'extension');
            nodeFs.mkdirSync(deepDir, { recursive: true });
            plantDevServer(testDir, 'cfn-lsp-server');

            const provider = new CfnDevLspServerProvider(makeExtensionContext(deepDir));

            expect(provider.canProvide()).toBe(false);
        });

        it('skips ambiguous resolution when multiple servers found', () => {
            process.env.NODE_ENV = 'test';
            delete process.env.CFN_LSP_SERVER_PATH;

            const extensionDir = join(testDir, 'extension');
            nodeFs.mkdirSync(extensionDir, { recursive: true });
            plantDevServer(testDir, 'server-a');
            plantDevServer(testDir, 'server-b');

            const provider = new CfnDevLspServerProvider(makeExtensionContext(extensionDir));

            expect(provider.canProvide()).toBe(false);
        });
    });

    describe('provider interface', () => {
        it('name returns DevCfnLspServerProvider', () => {
            process.env.NODE_ENV = 'test';
            const provider = new CfnDevLspServerProvider(makeExtensionContext(join(testDir, 'ext')));
            expect(provider.name()).toBe('DevCfnLspServerProvider');
        });

        it('serverRootDir returns dirname of the server executable', async () => {
            process.env.NODE_ENV = 'test';
            delete process.env.CFN_LSP_SERVER_PATH;

            const extensionDir = join(testDir, 'extension');
            nodeFs.mkdirSync(extensionDir, { recursive: true });
            plantDevServer(testDir, 'cfn-lsp');

            const provider = new CfnDevLspServerProvider(makeExtensionContext(extensionDir));
            const rootDir = await provider.serverRootDir();

            expect(rootDir).toBe(join(testDir, 'cfn-lsp', 'bundle', 'development'));
        });

        it('serverExecutable rejects when not available', () => {
            process.env.AWS_ENV = 'prod';
            delete process.env.NODE_ENV;
            delete process.env.CFN_LSP_SERVER_PATH;

            const provider = new CfnDevLspServerProvider(makeExtensionContext(join(testDir, 'ext')));

            return expect(provider.serverExecutable()).rejects.toThrow('No dev server location');
        });

        it('close is a no-op', () => {
            process.env.NODE_ENV = 'test';
            const provider = new CfnDevLspServerProvider(makeExtensionContext(join(testDir, 'ext')));
            expect(() => provider.close()).not.toThrow();
        });
    });
});
