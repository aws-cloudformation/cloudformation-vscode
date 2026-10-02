import nodeFs from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, beforeEach, afterEach, it, expect, vi } from 'vitest';
import { window } from 'vscode';
import {
    BaseLspInstaller,
    FetchBuffer,
    isZipEntrySafe,
    LspInstallerConfig,
} from '../../../src/lsp-server/installer/BaseLspInstaller';
import { NodeFileSystem } from '../../../src/lsp-server/installer/CfnLspInstaller';
import { LoggerFactory } from '../../../src/utils/Logger';

vi.mock('vscode');

const ServerFile = 'server.js';

function makeConfig(baseDir: string): LspInstallerConfig {
    return {
        name: 'zip-test-server',
        supportedVersions: '<2.0.0',
        manifestUrl: 'https://example.com/manifest.json',
        serverFile: ServerFile,
        baseRoot: baseDir,
        sleeper: async () => {},
    };
}

/**
 * Creates a minimal ZIP file buffer manually.
 * This produces a valid ZIP that yauzl can parse.
 */
function createMinimalZip(entries: Array<{ name: string; content: string }>): Buffer {
    const localHeaders: Buffer[] = [];
    const centralHeaders: Buffer[] = [];
    let offset = 0;

    for (const entry of entries) {
        const nameBytes = Buffer.from(entry.name, 'utf8');
        const contentBytes = Buffer.from(entry.content, 'utf8');

        // Local file header
        const localHeader = Buffer.alloc(30 + nameBytes.length + contentBytes.length);
        localHeader.writeUInt32LE(0x04034b50, 0); // signature
        localHeader.writeUInt16LE(20, 4); // version needed
        localHeader.writeUInt16LE(0, 6); // flags
        localHeader.writeUInt16LE(0, 8); // compression (store)
        localHeader.writeUInt16LE(0, 10); // mod time
        localHeader.writeUInt16LE(0, 12); // mod date
        localHeader.writeUInt32LE(crc32(contentBytes), 14); // crc32
        localHeader.writeUInt32LE(contentBytes.length, 18); // compressed size
        localHeader.writeUInt32LE(contentBytes.length, 22); // uncompressed size
        localHeader.writeUInt16LE(nameBytes.length, 26); // filename length
        localHeader.writeUInt16LE(0, 28); // extra field length
        nameBytes.copy(localHeader, 30);
        contentBytes.copy(localHeader, 30 + nameBytes.length);
        localHeaders.push(localHeader);

        // Central directory header
        const centralHeader = Buffer.alloc(46 + nameBytes.length);
        centralHeader.writeUInt32LE(0x02014b50, 0); // signature
        centralHeader.writeUInt16LE(20, 4); // version made by
        centralHeader.writeUInt16LE(20, 6); // version needed
        centralHeader.writeUInt16LE(0, 8); // flags
        centralHeader.writeUInt16LE(0, 10); // compression
        centralHeader.writeUInt16LE(0, 12); // mod time
        centralHeader.writeUInt16LE(0, 14); // mod date
        centralHeader.writeUInt32LE(crc32(contentBytes), 16); // crc32
        centralHeader.writeUInt32LE(contentBytes.length, 20); // compressed size
        centralHeader.writeUInt32LE(contentBytes.length, 24); // uncompressed size
        centralHeader.writeUInt16LE(nameBytes.length, 28); // filename length
        centralHeader.writeUInt16LE(0, 30); // extra field length
        centralHeader.writeUInt16LE(0, 32); // comment length
        centralHeader.writeUInt16LE(0, 34); // disk number
        centralHeader.writeUInt16LE(0, 36); // internal attrs
        centralHeader.writeUInt32LE(0, 38); // external attrs
        centralHeader.writeUInt32LE(offset, 42); // local header offset
        nameBytes.copy(centralHeader, 46);
        centralHeaders.push(centralHeader);

        offset += localHeader.length;
    }

    const centralDirOffset = offset;
    const centralDirSize = centralHeaders.reduce((sum, h) => sum + h.length, 0);

    // End of central directory
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0); // signature
    eocd.writeUInt16LE(0, 4); // disk number
    eocd.writeUInt16LE(0, 6); // disk with cd
    eocd.writeUInt16LE(entries.length, 8); // entries on disk
    eocd.writeUInt16LE(entries.length, 10); // total entries
    eocd.writeUInt32LE(centralDirSize, 12); // cd size
    eocd.writeUInt32LE(centralDirOffset, 16); // cd offset
    eocd.writeUInt16LE(0, 20); // comment length

    return Buffer.concat([...localHeaders, ...centralHeaders, eocd]);
}

/** CRC32 computation for ZIP format */
function crc32(buf: Buffer): number {
    let crc = 0xffffffff;
    for (const byte of buf) {
        crc ^= byte;
        for (let j = 0; j < 8; j++) {
            if (crc & 1) {
                crc = (crc >>> 1) ^ 0xedb88320;
            } else {
                crc = crc >>> 1;
            }
        }
    }
    return (crc ^ 0xffffffff) >>> 0;
}

describe('BaseLspInstaller - zip extraction', () => {
    let testDir: string;

    beforeEach(() => {
        LoggerFactory.reset();
        LoggerFactory.initialize(window.createOutputChannel('test', { log: true }));
        testDir = nodeFs.mkdtempSync(join(tmpdir(), 'zip-test-'));
    });

    afterEach(() => {
        nodeFs.rmSync(testDir, { recursive: true, force: true });
    });

    it('extracts a real zip containing the server file', async () => {
        const zipData = createMinimalZip([{ name: ServerFile, content: 'console.log("server")' }]);

        const fetcher: FetchBuffer = vi.fn().mockImplementation((url: string) => {
            if (url.includes('manifest')) {
                return Promise.resolve(
                    Buffer.from(
                        JSON.stringify({
                            versions: [
                                {
                                    serverVersion: '1.0.0',
                                    latest: true,
                                    isDelisted: false,
                                    targets: [
                                        {
                                            platform: process.platform,
                                            arch: process.arch,
                                            contents: [
                                                {
                                                    filename: 'server.zip',
                                                    url: 'https://example.com/server.zip',
                                                    hashes: [],
                                                    bytes: zipData.length,
                                                },
                                            ],
                                        },
                                    ],
                                },
                            ],
                        }),
                    ),
                );
            }
            return Promise.resolve(zipData);
        });

        const installer = new BaseLspInstaller(makeConfig(testDir), new NodeFileSystem(), fetcher);
        const result = await installer.resolve();

        expect(result.location).toBe('remote');
        expect(result.version).toBe('1.0.0');
        expect(nodeFs.existsSync(result.serverPath)).toBe(true);
        expect(nodeFs.readFileSync(result.serverPath, 'utf8')).toBe('console.log("server")');
    });

    it('deletes zip files after extraction', async () => {
        const zipData = createMinimalZip([{ name: ServerFile, content: 'server' }]);

        const fetcher: FetchBuffer = vi.fn().mockImplementation((url: string) => {
            if (url.includes('manifest')) {
                return Promise.resolve(
                    Buffer.from(
                        JSON.stringify({
                            versions: [
                                {
                                    serverVersion: '1.0.0',
                                    latest: true,
                                    isDelisted: false,
                                    targets: [
                                        {
                                            platform: process.platform,
                                            arch: process.arch,
                                            contents: [
                                                {
                                                    filename: 'server.zip',
                                                    url: 'https://example.com/server.zip',
                                                    hashes: [],
                                                    bytes: zipData.length,
                                                },
                                            ],
                                        },
                                    ],
                                },
                            ],
                        }),
                    ),
                );
            }
            return Promise.resolve(zipData);
        });

        const installer = new BaseLspInstaller(makeConfig(testDir), new NodeFileSystem(), fetcher);
        await installer.resolve();

        const versionDir = join(testDir, 'language-servers', 'zip-test-server', '1.0.0');
        const zipFiles = nodeFs.readdirSync(versionDir).filter((f) => f.endsWith('.zip'));
        expect(zipFiles).toHaveLength(0);
    });

    it('rejects zip entries with path traversal (..)', async () => {
        // The ZIP extracts into <testDir>/language-servers/zip-test-server/<ver>.tmp.<x>/server/.
        // A malicious entry with "../../../../<sentinel>" would escape to <testDir>/<sentinel>.
        // Use a unique sentinel that cannot pre-exist on any real system.
        const sentinel = `__zip-traversal-sentinel-${Date.now()}.txt`;
        const zipData = createMinimalZip([
            { name: `../../../../${sentinel}`, content: 'malicious' },
            { name: ServerFile, content: 'server' },
        ]);

        const fetcher: FetchBuffer = vi.fn().mockImplementation((url: string) => {
            if (url.includes('manifest')) {
                return Promise.resolve(
                    Buffer.from(
                        JSON.stringify({
                            versions: [
                                {
                                    serverVersion: '1.0.0',
                                    latest: true,
                                    isDelisted: false,
                                    targets: [
                                        {
                                            platform: process.platform,
                                            arch: process.arch,
                                            contents: [
                                                {
                                                    filename: 'server.zip',
                                                    url: 'https://example.com/server.zip',
                                                    hashes: [],
                                                    bytes: zipData.length,
                                                },
                                            ],
                                        },
                                    ],
                                },
                            ],
                        }),
                    ),
                );
            }
            return Promise.resolve(zipData);
        });

        const installer = new BaseLspInstaller(makeConfig(testDir), new NodeFileSystem(), fetcher);
        await expect(installer.resolve()).rejects.toThrow();

        // The traversal would resolve to exactly <testDir>/<sentinel> — verify it was never written
        expect(nodeFs.existsSync(join(testDir, sentinel))).toBe(false);
    });

    it('validates required server file before atomic rename', async () => {
        const zipData = createMinimalZip([{ name: 'other-file.txt', content: 'not a server' }]);

        const fetcher: FetchBuffer = vi.fn().mockImplementation((url: string) => {
            if (url.includes('manifest')) {
                return Promise.resolve(
                    Buffer.from(
                        JSON.stringify({
                            versions: [
                                {
                                    serverVersion: '1.0.0',
                                    latest: true,
                                    isDelisted: false,
                                    targets: [
                                        {
                                            platform: process.platform,
                                            arch: process.arch,
                                            contents: [
                                                {
                                                    filename: 'server.zip',
                                                    url: 'https://example.com/server.zip',
                                                    hashes: [],
                                                    bytes: zipData.length,
                                                },
                                            ],
                                        },
                                    ],
                                },
                            ],
                        }),
                    ),
                );
            }
            return Promise.resolve(zipData);
        });

        const installer = new BaseLspInstaller(makeConfig(testDir), new NodeFileSystem(), fetcher);
        await expect(installer.resolve()).rejects.toThrow('No server available');
    });

    it('verifies hash (algorithm:digest format) - passes on match', async () => {
        const { createHash } = await import('crypto');
        const zipData = createMinimalZip([{ name: ServerFile, content: 'server-content' }]);
        const hash = createHash('sha256').update(zipData).digest('hex');

        const fetcher: FetchBuffer = vi.fn().mockImplementation((url: string) => {
            if (url.includes('manifest')) {
                return Promise.resolve(
                    Buffer.from(
                        JSON.stringify({
                            versions: [
                                {
                                    serverVersion: '1.0.0',
                                    latest: true,
                                    isDelisted: false,
                                    targets: [
                                        {
                                            platform: process.platform,
                                            arch: process.arch,
                                            contents: [
                                                {
                                                    filename: 'server.zip',
                                                    url: 'https://example.com/server.zip',
                                                    hashes: [`sha256:${hash}`],
                                                    bytes: zipData.length,
                                                },
                                            ],
                                        },
                                    ],
                                },
                            ],
                        }),
                    ),
                );
            }
            return Promise.resolve(zipData);
        });

        const installer = new BaseLspInstaller(makeConfig(testDir), new NodeFileSystem(), fetcher);
        const result = await installer.resolve();

        expect(result.location).toBe('remote');
    });

    it('verifies hash (algorithm:digest format) - fails on mismatch', async () => {
        const zipData = createMinimalZip([{ name: ServerFile, content: 'server' }]);

        const fetcher: FetchBuffer = vi.fn().mockImplementation((url: string) => {
            if (url.includes('manifest')) {
                return Promise.resolve(
                    Buffer.from(
                        JSON.stringify({
                            versions: [
                                {
                                    serverVersion: '1.0.0',
                                    latest: true,
                                    isDelisted: false,
                                    targets: [
                                        {
                                            platform: process.platform,
                                            arch: process.arch,
                                            contents: [
                                                {
                                                    filename: 'server.zip',
                                                    url: 'https://example.com/server.zip',
                                                    hashes: ['sha256:badbadbadbadbadbadbad'],
                                                    bytes: zipData.length,
                                                },
                                            ],
                                        },
                                    ],
                                },
                            ],
                        }),
                    ),
                );
            }
            return Promise.resolve(zipData);
        });

        const installer = new BaseLspInstaller(makeConfig(testDir), new NodeFileSystem(), fetcher);
        await expect(installer.resolve()).rejects.toThrow();
    });

    it('download retries exactly 3 times before failing', async () => {
        const fetchCalls: string[] = [];
        const fetcher: FetchBuffer = vi.fn().mockImplementation((url: string) => {
            fetchCalls.push(url);
            if (url.includes('manifest')) {
                return Promise.resolve(
                    Buffer.from(
                        JSON.stringify({
                            versions: [
                                {
                                    serverVersion: '1.0.0',
                                    latest: true,
                                    isDelisted: false,
                                    targets: [
                                        {
                                            platform: process.platform,
                                            arch: process.arch,
                                            contents: [
                                                {
                                                    filename: 'server.zip',
                                                    url: 'https://example.com/server.zip',
                                                    hashes: [],
                                                    bytes: 100,
                                                },
                                            ],
                                        },
                                    ],
                                },
                            ],
                        }),
                    ),
                );
            }
            return Promise.reject(new Error('Download failed'));
        });

        const installer = new BaseLspInstaller(makeConfig(testDir), new NodeFileSystem(), fetcher);
        await expect(installer.resolve()).rejects.toThrow();

        const downloadCalls = fetchCalls.filter((url) => url.includes('server.zip'));
        expect(downloadCalls).toHaveLength(3);
    });
});

describe('isZipEntrySafe', () => {
    const destDir = '/tmp/extract';

    describe('rejects path traversal', () => {
        it('rejects parent directory traversal (..)', () => {
            expect(isZipEntrySafe('../../../etc/passwd', destDir)).toBe(false);
        });

        it('rejects embedded .. in path', () => {
            expect(isZipEntrySafe('foo/../../../etc/passwd', destDir)).toBe(false);
        });

        it('rejects single .. component', () => {
            expect(isZipEntrySafe('..', destDir)).toBe(false);
        });
    });

    describe('rejects absolute POSIX paths', () => {
        it('rejects /etc/passwd', () => {
            expect(isZipEntrySafe('/etc/passwd', destDir)).toBe(false);
        });

        it('rejects /tmp/evil', () => {
            expect(isZipEntrySafe('/tmp/evil', destDir)).toBe(false);
        });
    });

    describe('rejects Windows drive paths', () => {
        it('rejects C:\\Windows\\System32\\cmd.exe', () => {
            expect(isZipEntrySafe('C:\\Windows\\System32\\cmd.exe', destDir)).toBe(false);
        });

        it('rejects C:/Windows/System32/cmd.exe', () => {
            expect(isZipEntrySafe('C:/Windows/System32/cmd.exe', destDir)).toBe(false);
        });

        it('rejects D:/malicious', () => {
            expect(isZipEntrySafe('D:/malicious', destDir)).toBe(false);
        });

        it('rejects lowercase drive letter', () => {
            expect(isZipEntrySafe('c:/evil.txt', destDir)).toBe(false);
        });
    });

    describe('rejects Windows UNC paths', () => {
        it('rejects \\\\server\\share', () => {
            expect(isZipEntrySafe('\\\\server\\share', destDir)).toBe(false);
        });

        it('rejects backslash paths', () => {
            expect(isZipEntrySafe('foo\\bar\\baz', destDir)).toBe(false);
        });
    });

    describe('rejects backslash separators', () => {
        it('rejects single backslash in path', () => {
            expect(isZipEntrySafe('sub\\file.txt', destDir)).toBe(false);
        });

        it('rejects mixed forward and backslash', () => {
            expect(isZipEntrySafe('foo/bar\\baz', destDir)).toBe(false);
        });
    });

    describe('accepts safe paths', () => {
        it('accepts simple filename', () => {
            expect(isZipEntrySafe('server.js', destDir)).toBe(true);
        });

        it('accepts nested path', () => {
            expect(isZipEntrySafe('lib/utils/helper.js', destDir)).toBe(true);
        });

        it('accepts directory entry (trailing slash)', () => {
            expect(isZipEntrySafe('lib/', destDir)).toBe(true);
        });

        it('accepts deeply nested path', () => {
            expect(isZipEntrySafe('a/b/c/d/e/file.txt', destDir)).toBe(true);
        });

        it('accepts file with dots in name (not traversal)', () => {
            expect(isZipEntrySafe('file.name.with.dots.txt', destDir)).toBe(true);
        });

        it('accepts hidden file (single dot prefix)', () => {
            expect(isZipEntrySafe('.hidden/config', destDir)).toBe(true);
        });
    });
});
