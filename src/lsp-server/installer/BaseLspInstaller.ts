import { createHash, randomBytes } from 'crypto';
import nodeFs from 'fs';
import { dirname, isAbsolute, join, relative, resolve } from 'path';
import { coerce, rcompare, satisfies, valid } from 'semver';
import { LoggerFactory } from '../../utils/Logger';
import {
    defaultManifestAdapter,
    ManifestAdapter,
    NormalizedManifest,
    TargetContent,
    Version,
} from '../manifest/ManifestTypes';
import { deleteZips, extractZips } from './archive';
import { detectPlatformTarget, PlatformTarget } from './platform';

export { isZipEntrySafe } from './archive';

export type LspResolution = {
    location: 'cache' | 'remote' | 'fallback';
    version: string;
    versionDir: string;
    serverPath: string;
};

export abstract class FileSystem {
    abstract exists(path: string): boolean;
    abstract mkdirRecursive(path: string): void;
    abstract readdir(path: string): nodeFs.Dirent[];
    abstract writeFile(path: string, data: Buffer): void;
    abstract readFileString(path: string, encoding: BufferEncoding): string;
    abstract remove(path: string): void;
    abstract rename(oldPath: string, newPath: string): void;
    abstract chmod(path: string, mode: number): void;
    abstract stat(path: string): nodeFs.Stats;
}

export type FetchBuffer = (url: string, timeoutMs: number) => Promise<Buffer>;

export type TargetResolver = () => PlatformTarget;

export type Sleeper = (ms: number) => Promise<void>;

export type LspInstallerConfig = Readonly<{
    name: string;
    supportedVersions: string;
    manifestUrl: string;
    serverFile: string;
    requiredFiles?: string[];
    baseRoot?: string;
    postInstall?: (resolution: LspResolution, fs: FileSystem) => void;
    manifestAdapter?: ManifestAdapter;
    targetResolver?: TargetResolver;
    sleeper?: Sleeper;
}>;

export type InstalledFallback = {
    version: string;
    versionDir: string;
    serverPath: string;
};

const FetchMaxAttempts = 3;
const FetchInitialDelayMs = 500;
const DownloadTimeoutMs = 5 * 60 * 1000;
const ManifestTimeoutMs = 30_000;
const TmpDirPattern = /\.tmp\.\d+\.[a-f0-9]+$/;

function defaultSleeper(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isPidAlive(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

function defaultBaseRoot(): string {
    switch (process.platform) {
        case 'darwin': {
            const home = process.env.HOME ?? process.env.USERPROFILE ?? '';
            return join(home, 'Library', 'Caches', 'aws', 'toolkits');
        }
        case 'win32': {
            const localAppData = process.env.LOCALAPPDATA ?? '';
            return join(localAppData, 'aws', 'toolkits');
        }
        default: {
            const home = process.env.HOME ?? process.env.USERPROFILE ?? '';
            return join(home, '.cache', 'aws', 'toolkits');
        }
    }
}

/**
 * Returns true if `child` is strictly contained within `parent` using
 * resolve/relative checks rather than string-prefix comparison.
 */
function isContainedWithin(child: string, parent: string): boolean {
    const resolvedChild = resolve(child);
    const resolvedParent = resolve(parent);

    if (resolvedChild === resolvedParent) {
        return false;
    }

    const rel = relative(resolvedParent, resolvedChild);
    return !rel.startsWith('..') && !isAbsolute(rel);
}

/**
 * Generic LSP server installer implementing manifest fetch with retry,
 * atomic cache, semver selection, safe zip extraction, hash verification,
 * atomic install via temp+rename, concurrent winner validation, and
 * cleanup retaining current + highest valid fallback.
 */
export class BaseLspInstaller {
    private readonly log = LoggerFactory.getLogger('BaseLspInstaller');
    private readonly config: LspInstallerConfig;
    private readonly fs: FileSystem;
    private readonly fetchBuffer: FetchBuffer;
    private readonly target: PlatformTarget;
    private readonly adapter: ManifestAdapter;
    private readonly sleeper: Sleeper;
    private lastResolution?: LspResolution;

    constructor(config: LspInstallerConfig, fs: FileSystem, fetchBuffer: FetchBuffer) {
        this.config = config;
        this.fs = fs;
        this.fetchBuffer = fetchBuffer;
        this.target = config.targetResolver ? config.targetResolver() : detectPlatformTarget();
        this.adapter = config.manifestAdapter ?? defaultManifestAdapter;
        this.sleeper = config.sleeper ?? defaultSleeper;
    }

    get baseRoot(): string {
        return this.config.baseRoot ?? defaultBaseRoot();
    }

    get downloadRoot(): string {
        return join(this.baseRoot, 'language-servers', this.config.name);
    }

    get manifestCachePath(): string {
        return join(this.downloadRoot, 'manifest.json');
    }

    get resolvedInstallation(): LspResolution | undefined {
        return this.lastResolution;
    }

    /**
     * Invalidates the previously resolved managed installation by removing its
     * versionDir from disk and clearing tracked state. Only removes directories
     * that are strictly contained within this installer's downloadRoot.
     */
    invalidateResolvedInstallation(): void {
        const resolution = this.lastResolution;
        this.lastResolution = undefined;

        if (!resolution) {
            return;
        }

        const versionDir = resolution.versionDir;

        if (!isContainedWithin(versionDir, this.downloadRoot)) {
            this.log.warn(
                `Skipping invalidation: versionDir '${versionDir}' is not within downloadRoot '${this.downloadRoot}'`,
            );
            return;
        }

        try {
            this.fs.remove(versionDir);
            this.log.info(`Invalidated resolved installation: ${versionDir}`);
        } catch (err) {
            this.log.warn(err, `Failed to remove versionDir during invalidation: ${versionDir}`);
        }
    }

    async resolve(): Promise<LspResolution> {
        const manifest = await this.fetchManifest();
        const versions = manifest.versions;

        if (versions.length === 0) {
            throw new Error('Manifest contains no versions');
        }

        this.fs.mkdirRecursive(this.downloadRoot);
        this.log.info(`Resolving ${this.config.name} (target: ${this.target.platform}/${this.target.arch})`);

        const latest = this.selectVersion(versions);
        const targetContents = this.getTargetContents(latest);
        const versionDir = this.versionDir(latest.serverVersion);

        const cachedServer = this.findServerFile(versionDir);
        if (cachedServer && this.validateRequiredFiles(versionDir)) {
            this.log.info(`Cache hit: ${latest.serverVersion}`);
            return this.finalize({
                location: 'cache',
                version: latest.serverVersion,
                versionDir,
                serverPath: cachedServer,
            });
        }

        try {
            const serverPath = await this.downloadVersion(latest.serverVersion, targetContents);
            this.log.info(`Downloaded: ${latest.serverVersion}`);
            return this.finalize({
                location: 'remote',
                version: latest.serverVersion,
                versionDir,
                serverPath,
            });
        } catch (err) {
            this.log.error(err, 'Download failed');
        }

        const fallback = this.findInstalledFallback(latest.serverVersion);
        if (fallback) {
            this.log.info(`Fallback: ${fallback.version}`);
            return this.finalize({
                location: 'fallback',
                version: fallback.version,
                versionDir: fallback.versionDir,
                serverPath: fallback.serverPath,
            });
        }

        throw new Error('No server available — check network connectivity and try again');
    }

    async fetchManifest(): Promise<NormalizedManifest> {
        this.fs.mkdirRecursive(this.downloadRoot);

        try {
            const rawBuffer = await this.fetchWithRetries(this.config.manifestUrl, ManifestTimeoutMs, 'Manifest fetch');
            const rawText = rawBuffer.toString('utf8');
            const parsed = this.adapter(JSON.parse(rawText));
            this.writeManifestCache(rawText);
            return parsed;
        } catch (fetchErr) {
            this.log.warn(fetchErr, 'Manifest fetch failed, trying cache');
            const cached = this.readManifestCache();
            if (cached) {
                this.log.info('Using cached manifest');
                return cached;
            }
            throw fetchErr;
        }
    }

    findServerFile(dir: string): string | undefined {
        const serverFile = this.config.serverFile;
        const direct = join(dir, serverFile);
        if (this.fs.exists(direct)) {
            return direct;
        }

        if (!this.fs.exists(dir)) {
            return undefined;
        }

        for (const entry of this.fs.readdir(dir)) {
            if (!entry.isDirectory()) {
                continue;
            }
            const candidate = join(dir, entry.name, serverFile);
            if (this.fs.exists(candidate)) {
                return candidate;
            }
        }
        return undefined;
    }

    installedVersions(): string[] {
        const root = this.downloadRoot;
        if (!this.fs.exists(root)) {
            return [];
        }
        return this.fs
            .readdir(root)
            .filter((d) => d.isDirectory() && !TmpDirPattern.test(d.name) && valid(coerce(d.name)) !== null)
            .map((d) => d.name);
    }

    findInstalledFallback(excludeVersion?: string): InstalledFallback | undefined {
        const range = this.config.supportedVersions;
        const candidates = this.installedVersions()
            .filter((v) => v !== excludeVersion)
            .filter((v) => {
                const coerced = coerce(v);
                return coerced !== null && satisfies(coerced, range);
            })
            .toSorted((a, b) => rcompare(coerce(a) ?? '0.0.0', coerce(b) ?? '0.0.0'));

        for (const version of candidates) {
            const vDir = join(this.downloadRoot, version);
            const serverPath = this.findServerFile(vDir);
            if (serverPath && this.validateRequiredFiles(vDir)) {
                return { version, versionDir: vDir, serverPath };
            }
        }
        return undefined;
    }

    cleanup(currentVersion: string): void {
        try {
            this.sweepStaleTmpDirs();

            const versions = this.installedVersions();
            const range = this.config.supportedVersions;

            const fallback = versions
                .filter((v) => v !== currentVersion)
                .filter((v) => {
                    const coerced = coerce(v);
                    return coerced !== null && satisfies(coerced, range);
                })
                .filter((v) => {
                    const vDir = join(this.downloadRoot, v);
                    return this.findServerFile(vDir) !== undefined && this.validateRequiredFiles(vDir);
                })
                .toSorted((a, b) => rcompare(coerce(a) ?? '0.0.0', coerce(b) ?? '0.0.0'))[0];

            const keep = new Set([currentVersion, ...(fallback ? [fallback] : [])]);

            for (const version of versions) {
                if (keep.has(version)) {
                    continue;
                }
                const vDir = join(this.downloadRoot, version);
                this.log.debug(`Removing old version: ${version}`);
                this.fs.remove(vDir);
            }
        } catch (err) {
            this.log.warn(err, 'Cleanup failed');
        }
    }

    private writeManifestCache(rawText: string): void {
        try {
            const cachePath = this.manifestCachePath;
            const tmpPath = `${cachePath}.tmp.${process.pid}.${randomBytes(4).toString('hex')}`;
            this.fs.writeFile(tmpPath, Buffer.from(rawText, 'utf8'));
            try {
                this.fs.rename(tmpPath, cachePath);
            } catch {
                try {
                    this.fs.remove(tmpPath);
                } catch {
                    // best effort
                }
            }
        } catch (err) {
            this.log.debug(err, 'Failed to cache manifest');
        }
    }

    private readManifestCache(): NormalizedManifest | undefined {
        try {
            const cachePath = this.manifestCachePath;
            if (!this.fs.exists(cachePath)) {
                return undefined;
            }
            const raw = this.fs.readFileString(cachePath, 'utf8');
            return this.adapter(JSON.parse(raw));
        } catch (err) {
            this.log.warn(err, 'Failed to read cached manifest');
            return undefined;
        }
    }

    private selectVersion(versions: Version[]): Version {
        const range = this.config.supportedVersions;
        const compatible = versions
            .filter((v) => !v.isDelisted && valid(coerce(v.serverVersion)))
            .filter((v) => satisfies(coerce(v.serverVersion)!, range)) // eslint-disable-line @typescript-eslint/no-non-null-assertion
            .filter((v) => v.targets.some((t) => t.platform === this.target.platform && t.arch === this.target.arch))
            .toSorted((a, b) => rcompare(coerce(a.serverVersion) ?? '0.0.0', coerce(b.serverVersion) ?? '0.0.0'));

        if (compatible.length === 0) {
            throw new Error(`No compatible version for ${this.target.platform}/${this.target.arch} (range: ${range})`);
        }

        const picked = compatible[0];
        this.log.debug(`Selected: ${picked.serverVersion} (${compatible.length} candidates)`);
        return picked;
    }

    private getTargetContents(version: Version): TargetContent[] {
        const target = version.targets.find((t) => t.platform === this.target.platform && t.arch === this.target.arch);
        if (!target?.contents?.length) {
            throw new Error(`No target contents for ${this.target.platform}/${this.target.arch}`);
        }
        return target.contents;
    }

    private async downloadVersion(version: string, contents: TargetContent[]): Promise<string> {
        const versionDir = this.versionDir(version);
        const tmpDir = `${versionDir}.tmp.${process.pid}.${randomBytes(4).toString('hex')}`;
        this.fs.remove(tmpDir);
        this.fs.mkdirRecursive(tmpDir);

        try {
            for (const content of contents) {
                this.log.info(`Downloading ${content.filename} (${content.bytes} bytes)`);

                const data = await this.fetchWithRetries(
                    content.url,
                    DownloadTimeoutMs,
                    `Download '${content.filename}'`,
                );

                if (!this.verifyHashes(data, content.hashes, content.filename)) {
                    throw new Error(`Hash verification failed for ${content.filename}`);
                }

                this.fs.writeFile(join(tmpDir, content.filename), data);
            }

            await extractZips(tmpDir, this.fs);
            deleteZips(tmpDir, this.fs);

            const serverPath = this.findServerFile(tmpDir);
            if (!serverPath) {
                throw new Error(`Required server file '${this.config.serverFile}' not found after extraction`);
            }
            if (!this.validateRequiredFiles(tmpDir)) {
                throw new Error('Required files missing after extraction');
            }

            try {
                this.fs.rename(tmpDir, versionDir);
            } catch {
                this.fs.remove(tmpDir);
                const winnerServer = this.findServerFile(versionDir);
                if (!winnerServer || !this.validateRequiredFiles(versionDir)) {
                    throw new Error(`Concurrent install won but validation failed in ${versionDir}`);
                }
                return winnerServer;
            }

            return this.findServerFile(versionDir)!; // eslint-disable-line @typescript-eslint/no-non-null-assertion
        } catch (err) {
            this.fs.remove(tmpDir);
            throw err;
        }
    }

    private async fetchWithRetries(url: string, timeoutMs: number, description: string): Promise<Buffer> {
        let delayMs = FetchInitialDelayMs;
        let lastError: unknown;

        for (let attempt = 1; attempt <= FetchMaxAttempts; attempt++) {
            try {
                return await this.fetchBuffer(url, timeoutMs);
            } catch (err) {
                lastError = err;
                if (attempt < FetchMaxAttempts) {
                    this.log.warn(err, `${description} failed (attempt ${attempt}/${FetchMaxAttempts}), retrying`);
                    await this.sleeper(delayMs);
                    delayMs *= 2;
                }
            }
        }

        throw lastError;
    }

    private verifyHashes(data: Buffer, expectedHashes: string[], filename: string): boolean {
        const parseable = (expectedHashes ?? []).filter((h) => h.includes(':'));
        if (parseable.length === 0) {
            return true;
        }

        for (const expected of parseable) {
            const sep = expected.indexOf(':');
            const algorithm = expected.slice(0, sep);
            const digest = expected.slice(sep + 1);
            try {
                const computed = createHash(algorithm).update(data).digest('hex');
                if (computed.toLowerCase() === digest.toLowerCase()) {
                    return true;
                }
                this.log.warn(`Hash mismatch for ${algorithm} on '${filename}'`);
            } catch (err) {
                this.log.warn(err, `Unsupported hash algorithm '${algorithm}'`);
            }
        }

        return false;
    }

    private validateRequiredFiles(dir: string): boolean {
        const extra = this.config.requiredFiles ?? [];
        if (extra.length === 0) {
            return true;
        }

        const serverPath = this.findServerFile(dir);
        if (!serverPath) {
            return false;
        }
        const effectiveRoot = dirname(serverPath);

        for (const req of extra) {
            if (!this.fs.exists(join(effectiveRoot, req))) {
                return false;
            }
        }
        return true;
    }

    private sweepStaleTmpDirs(): void {
        const root = this.downloadRoot;
        if (!this.fs.exists(root)) {
            return;
        }
        for (const entry of this.fs.readdir(root)) {
            if (!TmpDirPattern.test(entry.name)) {
                continue;
            }
            const parts = entry.name.split('.tmp.');
            if (parts.length < 2) {
                continue;
            }
            const pidStr = parts[1].split('.')[0];
            const pid = Number.parseInt(pidStr, 10);
            if (!Number.isNaN(pid) && !isPidAlive(pid)) {
                this.fs.remove(join(root, entry.name));
            }
        }
    }

    private finalize(resolution: LspResolution): LspResolution {
        this.lastResolution = resolution;
        if (this.config.postInstall) {
            this.config.postInstall(resolution, this.fs);
        }
        if (!this.validateRequiredFiles(resolution.versionDir)) {
            throw new Error('Required files missing after post-install');
        }
        return resolution;
    }

    private versionDir(version: string): string {
        return join(this.downloadRoot, version);
    }
}
