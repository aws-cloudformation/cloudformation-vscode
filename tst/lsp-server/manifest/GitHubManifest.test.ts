import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import axios from 'axios';
import { vi, describe, beforeEach, afterEach, it, expect } from 'vitest';
import { window } from 'vscode';
import { GitHubManifest } from '../../../src/lsp-server/manifest/GitHubManifest';
import { Manifest } from '../../../src/lsp-server/manifest/ManifestTypes';
import { LoggerFactory } from '../../../src/utils/Logger';

vi.mock('vscode');
vi.mock('axios', () => ({ default: vi.fn() }));

const mockedAxios = axios as unknown as ReturnType<typeof vi.fn>;

function manifestFixture(): Manifest {
    return {
        manifestSchemaVersion: '1.0',
        artifactId: 'cfn-lsp',
        artifactDescription: 'CFN Language Server',
        isManifestDeprecated: false,
        alpha: [],
        beta: [],
        prod: [
            {
                serverVersion: '1.2.3',
                latest: true,
                isDelisted: false,
                targets: [{ platform: 'darwin', arch: 'arm64', contents: [] }],
            },
        ],
    };
}

describe('GitHubManifest', () => {
    let downloadRoot: string;
    let manifest: GitHubManifest;

    beforeEach(() => {
        vi.clearAllMocks();
        LoggerFactory.reset();
        LoggerFactory.initialize(window.createOutputChannel('test'));

        downloadRoot = mkdtempSync(join(tmpdir(), 'ghmanifest-'));
        manifest = new GitHubManifest(downloadRoot);
    });

    afterEach(() => {
        rmSync(downloadRoot, { recursive: true, force: true });
    });

    describe('fetchManifest', () => {
        it('should return manifest and write it to cache on successful fetch', async () => {
            const fixture = manifestFixture();
            mockedAxios.mockResolvedValue({ data: JSON.stringify(fixture) });

            const result = await manifest.fetchManifest();

            expect(result.prod[0].serverVersion).toBe('1.2.3');
            const cachePath = join(downloadRoot, 'manifest.json');
            expect(existsSync(cachePath)).toBe(true);
            expect(JSON.parse(readFileSync(cachePath, 'utf8'))).toEqual(fixture);
        });

        it('should fall back to cached manifest when fetch fails', async () => {
            const fixture = manifestFixture();
            writeFileSync(join(downloadRoot, 'manifest.json'), JSON.stringify(fixture));
            mockedAxios.mockRejectedValue(new Error('ENETUNREACH'));

            const result = await manifest.fetchManifest();

            expect(result.prod[0].serverVersion).toBe('1.2.3');
        });

        it('should throw when fetch fails and no cache exists', async () => {
            mockedAxios.mockRejectedValue(new Error('ENETUNREACH'));

            await expect(manifest.fetchManifest()).rejects.toThrow(
                'Failed to fetch manifest and no cached manifest available',
            );
        });
    });
});
