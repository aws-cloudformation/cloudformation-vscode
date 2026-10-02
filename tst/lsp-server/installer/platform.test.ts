import { describe, it, expect, vi, beforeEach } from 'vitest';
import { window } from 'vscode';
import {
    detectPlatformTarget,
    LinuxDetectorDeps,
    parseMaxGlibcxx,
    targetArch,
} from '../../../src/lsp-server/installer/platform';
import { LoggerFactory } from '../../../src/utils/Logger';

vi.mock('vscode');

describe('platform detection', () => {
    beforeEach(() => {
        LoggerFactory.reset();
        LoggerFactory.initialize(window.createOutputChannel('test', { log: true }));
    });

    describe('detectPlatformTarget (default, no injection)', () => {
        it('returns current platform and arch', () => {
            const target = detectPlatformTarget();
            if (process.platform === 'linux') {
                // On Linux the detector may resolve to native or legacy target
                expect(['linux', 'linuxglib2.28']).toContain(target.platform);
            } else {
                expect(target.platform).toBe(process.platform);
            }
            expect(target.arch).toBe(targetArch(process.arch));
        });
    });

    describe('detectPlatformTarget with injectable deps', () => {
        function makeDeps(overrides: Partial<LinuxDetectorDeps> = {}): LinuxDetectorDeps {
            return {
                platform: 'linux',
                arch: 'x64',
                env: {},
                existsSync: () => false,
                execSync: () => '',
                readFileSync: () => '',
                ...overrides,
            };
        }

        it('returns non-linux platform directly without legacy detection', () => {
            const deps = makeDeps({ platform: 'darwin', arch: 'arm64' });
            const target = detectPlatformTarget(deps);
            expect(target.platform).toBe('darwin');
            expect(target.arch).toBe('arm64');
        });

        it('returns win32 directly', () => {
            const deps = makeDeps({ platform: 'win32', arch: 'x64' });
            const target = detectPlatformTarget(deps);
            expect(target.platform).toBe('win32');
            expect(target.arch).toBe('x64');
        });

        it('detects Snap environment → legacy linux', () => {
            const deps = makeDeps({ env: { SNAP: '/snap/myapp/1' } });
            const target = detectPlatformTarget(deps);
            expect(target.platform).toBe('linuxglib2.28');
            expect(target.arch).toBe('x64');
        });

        it('detects legacy GLIBCXX below threshold → legacy linux', () => {
            const deps = makeDeps({
                existsSync: (p) => p === '/usr/lib/x86_64-linux-gnu/libstdc++.so.6',
                execSync: () => {
                    throw new Error('no strings');
                },
                readFileSync: () => 'GLIBCXX_3.4.20\nGLIBCXX_3.4.25\nGLIBCXX_3.4.28\n',
            });

            const target = detectPlatformTarget(deps);
            expect(target.platform).toBe('linuxglib2.28');
        });

        it('detects modern GLIBCXX at threshold → modern linux', () => {
            const deps = makeDeps({
                existsSync: (p) => p === '/usr/lib/x86_64-linux-gnu/libstdc++.so.6',
                execSync: () => 'GLIBCXX_3.4.29\nGLIBCXX_3.4.30\n',
            });

            const target = detectPlatformTarget(deps);
            expect(target.platform).toBe('linux');
        });

        it('detects modern GLIBCXX above threshold → modern linux', () => {
            const deps = makeDeps({
                existsSync: (p) => p === '/usr/lib64/libstdc++.so.6',
                execSync: () => 'GLIBCXX_3.4.30\nGLIBCXX_3.4.31\n',
            });

            const target = detectPlatformTarget(deps);
            expect(target.platform).toBe('linux');
        });

        it('falls back to linux when no libstdc++ found', () => {
            const deps = makeDeps({
                existsSync: () => false,
                execSync: () => {
                    throw new Error('not found');
                },
            });

            const target = detectPlatformTarget(deps);
            expect(target.platform).toBe('linux');
        });

        it('uses ldconfig output to find libstdc++', () => {
            const deps = makeDeps({
                execSync: (cmd: string) => {
                    if (cmd.includes('ldconfig')) {
                        return '\tlibstdc++.so.6 (libc6,x86-64) => /usr/lib/x86_64-linux-gnu/libstdc++.so.6\n';
                    }
                    if (cmd.includes('strings')) {
                        return 'GLIBCXX_3.4.30\n';
                    }
                    return '';
                },
                existsSync: () => false,
            });

            const target = detectPlatformTarget(deps);
            expect(target.platform).toBe('linux');
        });

        it('falls back to readFileSync when execSync (strings) fails', () => {
            let execCalled = 0;
            const deps = makeDeps({
                existsSync: (p) => p === '/usr/lib/x86_64-linux-gnu/libstdc++.so.6',
                execSync: (cmd: string) => {
                    execCalled++;
                    if (cmd.includes('ldconfig')) {
                        throw new Error('no ldconfig');
                    }
                    throw new Error('no strings');
                },
                readFileSync: () => 'some binary content GLIBCXX_3.4.20 more GLIBCXX_3.4.28',
            });

            const target = detectPlatformTarget(deps);
            expect(target.platform).toBe('linuxglib2.28');
            expect(execCalled).toBeGreaterThan(0);
        });

        it('applies the mapping when detecting the platform target', () => {
            expect(detectPlatformTarget(makeDeps({ platform: 'darwin', arch: 'arm' })).arch).toBe('arm64');
        });

        it('preserves arch from deps', () => {
            const deps = makeDeps({ platform: 'linux', arch: 'arm64' });
            const target = detectPlatformTarget(deps);
            expect(target.arch).toBe('arm64');
        });
    });

    describe('targetArch', () => {
        it.each(['arm', 'arm64'])('maps %s to the arm64 release target', (nodeArch) => {
            expect(targetArch(nodeArch)).toBe('arm64');
        });

        it.each(['x64', 'ia32', 'ppc64', 's390x'])('maps %s to the x64 release target', (nodeArch) => {
            expect(targetArch(nodeArch)).toBe('x64');
        });
    });

    describe('parseMaxGlibcxx', () => {
        it('parses multiple GLIBCXX versions and returns highest', () => {
            const input = 'GLIBCXX_3.4.20\nGLIBCXX_3.4.25\nGLIBCXX_3.4.29\nGLIBCXX_3.4.30\n';
            expect(parseMaxGlibcxx(input)).toBe('3.4.30');
        });

        it('returns undefined for empty input', () => {
            expect(parseMaxGlibcxx('')).toBeUndefined();
        });

        it('returns undefined for non-GLIBCXX lines', () => {
            expect(parseMaxGlibcxx('some random text\nno versions here\n')).toBeUndefined();
        });

        it('handles single version', () => {
            expect(parseMaxGlibcxx('GLIBCXX_3.4.20\n')).toBe('3.4.20');
        });
    });
});
