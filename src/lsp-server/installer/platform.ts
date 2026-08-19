import { execSync } from 'child_process';
import nodeFs from 'fs';
import { LoggerFactory } from '../../utils/Logger';

/**
 * Resolved platform/arch pair used to match manifest targets.
 * Values use Node.js conventions (e.g. `darwin`, `win32`, `linux`, `linuxglib2.28`).
 */
export interface PlatformTarget {
    readonly platform: string;
    readonly arch: string;
}

/**
 * Injectable dependencies for Linux legacy detection.
 * Allows tests to provide deterministic behaviour without mutating process globals.
 */
export interface LinuxDetectorDeps {
    readonly platform: string;
    readonly arch: string;
    readonly env: Record<string, string | undefined>;
    existsSync(path: string): boolean;
    execSync(cmd: string, options: { encoding: 'utf8'; stdio: unknown[]; timeout: number }): string;
    readFileSync(path: string, encoding: 'binary'): string;
}

/** Default production dependencies backed by Node built-ins. */
function defaultDeps(): LinuxDetectorDeps {
    return {
        platform: process.platform,
        arch: process.arch,
        env: process.env,
        existsSync: nodeFs.existsSync,
        execSync: execSync as LinuxDetectorDeps['execSync'],
        readFileSync: (p, enc) => nodeFs.readFileSync(p, enc) as unknown as string,
    };
}

/**
 * Detects the current platform target using Node.js values.
 * On Linux, checks for legacy glibc and returns `linuxglib2.28` when the
 * system's GLIBCXX is below 3.4.29 or running inside a Snap container.
 */
export function detectPlatformTarget(deps?: LinuxDetectorDeps): PlatformTarget {
    const d = deps ?? defaultDeps();
    const platform = d.platform === 'linux' ? detectLinuxPlatform(d) : d.platform;
    return { platform, arch: d.arch };
}

const LegacyLinuxPlatform = 'linuxglib2.28';
const GlibcxxThreshold = '3.4.29';

function detectLinuxPlatform(deps: LinuxDetectorDeps): string {
    const log = LoggerFactory.getLogger('Platform');

    if (deps.env.SNAP !== undefined) {
        log.info('Snap environment detected, using legacy Linux target');
        return LegacyLinuxPlatform;
    }

    const maxGlibcxx = getMaxGlibcxxVersion(deps);
    if (!maxGlibcxx) {
        return 'linux';
    }

    log.info(`GLIBCXX max version: ${maxGlibcxx}`);
    if (versionLessThan(maxGlibcxx, GlibcxxThreshold)) {
        log.info(`GLIBCXX ${maxGlibcxx} < ${GlibcxxThreshold}, using legacy Linux target`);
        return LegacyLinuxPlatform;
    }

    return 'linux';
}

function getMaxGlibcxxVersion(deps: LinuxDetectorDeps): string | undefined {
    const libPath = findLibStdCpp(deps);
    if (!libPath) {
        return undefined;
    }

    try {
        const output = deps.execSync(`strings "${libPath}" | grep GLIBCXX`, {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
            timeout: 10_000,
        });
        return parseMaxGlibcxx(output);
    } catch {
        try {
            const content = deps.readFileSync(libPath, 'binary');
            const matches = content.match(/GLIBCXX_\d+\.\d+\.\d+/g);
            if (matches) {
                return parseMaxGlibcxx(matches.join('\n'));
            }
        } catch {
            // ignore
        }
    }

    return undefined;
}

/** Exported for testing. */
export function parseMaxGlibcxx(rawOutput: string): string | undefined {
    const versions = rawOutput
        .trim()
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.startsWith('GLIBCXX_'))
        .map((line) => {
            const match = /^GLIBCXX_(\d+\.\d+\.\d+)/.exec(line);
            return match ? match[1] : undefined;
        })
        .filter((v): v is string => v !== undefined);

    if (versions.length === 0) {
        return undefined;
    }

    return versions.toSorted((a, b) => compareVersionStrings(a, b)).at(-1);
}

function findLibStdCpp(deps: LinuxDetectorDeps): string | undefined {
    try {
        const ldconfig = deps.execSync('/sbin/ldconfig -p | grep libstdc++.so.6', {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
            timeout: 5000,
        });
        const match = /=>\s+(.+)$/m.exec(ldconfig);
        if (match?.[1]) {
            return match[1].trim();
        }
    } catch {
        // ignore
    }

    const commonPaths = [
        '/usr/lib/x86_64-linux-gnu/libstdc++.so.6',
        '/usr/lib64/libstdc++.so.6',
        '/usr/lib/libstdc++.so.6',
        '/lib/x86_64-linux-gnu/libstdc++.so.6',
    ];

    return commonPaths.find((p) => deps.existsSync(p));
}

/**
 * Simple semver-like comparison: returns negative if a < b, 0 if equal, positive if a > b.
 */
export function compareVersionStrings(a: string, b: string): number {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
        if (diff !== 0) {
            return diff;
        }
    }
    return 0;
}

/**
 * Returns true if version a is strictly less than version b.
 */
export function versionLessThan(a: string, b: string): boolean {
    return compareVersionStrings(a, b) < 0;
}
