import { describe, expect, it } from 'vitest';
import { defaultManifestAdapter, Version } from '../../../src/lsp-server/manifest/ManifestTypes';

function makeVersion(serverVersion: string): Version {
    return {
        serverVersion,
        latest: false,
        isDelisted: false,
        targets: [{ platform: 'darwin', arch: 'arm64', contents: [] }],
    };
}

describe('ManifestTypes', () => {
    describe('defaultManifestAdapter', () => {
        it('parses the generic flat versions array', () => {
            const result = defaultManifestAdapter({
                versions: [makeVersion('1.0.0'), makeVersion('1.5.0')],
                manifestSchemaVersion: '1.0',
            });

            expect(result.versions).toHaveLength(2);
            expect(result.versions[0].serverVersion).toBe('1.0.0');
        });

        it('allows an empty versions array for the installer to handle', () => {
            expect(defaultManifestAdapter({ versions: [] })).toEqual({ versions: [] });
        });

        it('does not infer alpha, beta, or prod channels', () => {
            const raw = {
                alpha: [makeVersion('1.0.0-alpha')],
                beta: [makeVersion('1.0.0-beta')],
                prod: [makeVersion('1.0.0')],
            };

            expect(() => defaultManifestAdapter(raw)).toThrow("top-level 'versions' array");
        });

        it('rejects non-object and missing versions payloads', () => {
            expect(() => defaultManifestAdapter(null)).toThrow("top-level 'versions' array");
            expect(() => defaultManifestAdapter({ manifestSchemaVersion: '1.0' })).toThrow(
                "top-level 'versions' array",
            );
        });

        it('preserves all version fields', () => {
            const raw = {
                versions: [
                    {
                        serverVersion: '1.2.3',
                        latest: true,
                        isDelisted: false,
                        targets: [
                            {
                                platform: 'linux',
                                arch: 'x64',
                                contents: [
                                    { filename: 'server.zip', url: 'http://x', hashes: ['sha256:abc'], bytes: 100 },
                                ],
                            },
                        ],
                    },
                ],
            };

            const version = defaultManifestAdapter(raw).versions[0];
            expect(version.serverVersion).toBe('1.2.3');
            expect(version.latest).toBe(true);
            expect(version.isDelisted).toBe(false);
            expect(version.targets[0].platform).toBe('linux');
            expect(version.targets[0].contents[0].hashes).toEqual(['sha256:abc']);
        });
    });
});
