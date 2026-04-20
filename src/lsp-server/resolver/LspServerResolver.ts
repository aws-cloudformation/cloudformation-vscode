import { createWriteStream, existsSync } from 'fs';
import { join } from 'path';
import { pipeline } from 'stream/promises';
import axios from 'axios';
import { valid, coerce, rcompare, satisfies } from 'semver';
import yauzl from 'yauzl';
import { environment } from '../../utils/ExtensionConfig';
import {
    fsExists,
    fsMkdir,
    fsReaddir,
    fsRemove,
    fsRename,
    getLspDownloadDir,
    isPidAlive,
} from '../../utils/FileSystem';
import { LoggerFactory } from '../../utils/Logger';
import { CfnLspServerFile } from '../LspServerProvider';
import { GitHubManifest } from '../manifest/GitHubManifest';
import { TargetContent, Version } from '../manifest/ManifestTypes';
import { InUseTracker } from './InUseTracker';

const SupportedServerVersions = '<2.0.0';

export interface LspResolution {
    location: 'cache' | 'remote' | 'fallback';
    version: string;
    serverPath: string;
}

export class LspServerResolver {
    private readonly log = LoggerFactory.getLogger('ServerResolver');
    private readonly downloadRoot: string;
    private readonly inUseTracker = new InUseTracker();

    constructor() {
        this.downloadRoot = getLspDownloadDir();
        fsMkdir(this.downloadRoot);
    }

    async resolve(): Promise<LspResolution> {
        const env = environment();

        try {
            const manifest = await new GitHubManifest(this.downloadRoot).fetchManifest();
            const versions = manifest[env];
            if (!versions?.length) {
                throw new Error(`No versions in manifest for environment '${env}'`);
            }
            return await this.resolveFromVersions(versions);
        } catch (err) {
            this.log.warn(err, 'Manifest resolution failed, searching for installed LSP');
        }

        const fallback = this.findBestCachedServer();
        if (fallback) {
            return fallback;
        }
        throw new Error('No server available — check network connectivity and try again');
    }

    cleanOldVersions(currentVersion: string): void {
        this.sweepStaleTmpDirs();

        const fallback = this.findFallbackVersion(currentVersion);
        const keep = new Set([currentVersion, ...(fallback ? [fallback] : [])]);

        for (const dir of this.cachedVersions()) {
            if (keep.has(dir)) {
                continue;
            }
            const versionDir = this.versionDir(dir);
            this.inUseTracker.cleanStaleMarkers(versionDir);
            if (this.inUseTracker.isInUse(versionDir)) {
                this.log.debug(`Skipping in-use version: ${dir}`);
                continue;
            }
            this.log.debug(`Removing old version: ${dir}`);
            fsRemove(versionDir);
        }
    }

    versionDirFor(version: string): string {
        return this.versionDir(version);
    }

    private async resolveFromVersions(versions: Version[]): Promise<LspResolution> {
        const latestVersion = this.latestCompatibleVersion(versions);
        const targetContents = this.getTargetContents(latestVersion);
        const cacheDir = this.versionDir(latestVersion.serverVersion);

        const existingServer = this.findServerFile(cacheDir);
        if (existingServer) {
            this.log.info(`Cache hit: ${latestVersion.serverVersion}`);
            return { location: 'cache', version: latestVersion.serverVersion, serverPath: existingServer };
        }

        if (this.hasValidCache(cacheDir, targetContents)) {
            await this.extractZips(cacheDir);
            return { location: 'cache', version: latestVersion.serverVersion, serverPath: this.serverPath(cacheDir) };
        }

        // Atomic to prevent partial installs visible to concurrent IDE instances
        const tmpDir = `${cacheDir}.tmp.${process.pid}`;
        try {
            await this.downloadVersion(tmpDir, targetContents);
            try {
                fsRename(tmpDir, cacheDir);
            } catch (renameErr) {
                this.log.debug(renameErr, 'Atomic rename failed, checking if another process completed it');
                fsRemove(tmpDir);
                if (!fsExists(cacheDir)) {
                    throw new Error('Rename failed and target does not exist');
                }
            }
            this.log.info(`Downloaded: ${latestVersion.serverVersion}`);
            return { location: 'remote', version: latestVersion.serverVersion, serverPath: this.serverPath(cacheDir) };
        } catch (err) {
            this.log.error(err, 'Server download failed');
            fsRemove(tmpDir);
        }

        const fallback = this.findBestCachedServer(latestVersion.serverVersion);
        if (fallback) {
            return fallback;
        }
        throw new Error('No server available — check network connectivity and try again');
    }

    private findBestCachedServer(excludeVersion?: string): LspResolution | undefined {
        const version = this.findFallbackVersion(excludeVersion);
        if (!version) {
            return undefined;
        }
        this.log.info(`Using installed fallback: ${version}`);
        return { location: 'fallback', version, serverPath: this.serverPath(this.versionDir(version)) };
    }

    private findFallbackVersion(excludeVersion?: string): string | undefined {
        return this.cachedVersions()
            .filter((v) => v !== excludeVersion && valid(coerce(v)))
            .filter((v) => satisfies(coerce(v)!, SupportedServerVersions)) // eslint-disable-line @typescript-eslint/no-non-null-assertion
            .toSorted((a, b) => rcompare(coerce(a) ?? '0.0.0', coerce(b) ?? '0.0.0'))
            .find((v) => this.findServerFile(this.versionDir(v)) !== undefined);
    }

    private latestCompatibleVersion(versions: Version[]): Version {
        const compatible = versions
            .filter((v) => !v.isDelisted && valid(coerce(v.serverVersion)))
            .filter((v) => satisfies(coerce(v.serverVersion)!, SupportedServerVersions)) // eslint-disable-line @typescript-eslint/no-non-null-assertion
            .filter((v) => v.targets.some((t) => t.platform === process.platform && t.arch === process.arch))
            .toSorted((a, b) => rcompare(coerce(a.serverVersion) ?? '0.0.0', coerce(b.serverVersion) ?? '0.0.0'));

        if (compatible.length === 0) {
            throw new Error(
                `No compatible server version for ${process.platform}/${process.arch} (range: ${SupportedServerVersions})`,
            );
        }
        return compatible.find((v) => v.latest) ?? compatible[0];
    }

    private getTargetContents(version: Version): TargetContent[] {
        const target = version.targets.find((t) => t.platform === process.platform && t.arch === process.arch);
        if (!target?.contents?.length) {
            throw new Error(`No target contents for ${process.platform}/${process.arch}`);
        }
        return target.contents;
    }

    private hasValidCache(cacheDir: string, contents: TargetContent[]): boolean {
        return fsExists(cacheDir) && contents.every((c) => fsExists(join(cacheDir, c.filename)));
    }

    private findServerFile(versionDir: string): string | undefined {
        if (!fsExists(versionDir)) return undefined;
        for (const folder of fsReaddir(versionDir).filter((e) => e.isDirectory())) {
            const candidate = join(versionDir, folder.name, CfnLspServerFile);
            if (fsExists(candidate)) return candidate;
        }
        const direct = join(versionDir, CfnLspServerFile);
        return fsExists(direct) ? direct : undefined;
    }

    private serverPath(versionDir: string): string {
        const found = this.findServerFile(versionDir);
        if (found) return found;
        throw new Error(`Server file not found in ${versionDir}`);
    }

    private async downloadVersion(cacheDir: string, contents: TargetContent[]): Promise<void> {
        fsMkdir(cacheDir);
        for (const content of contents) {
            this.log.info({ bytes: content.bytes, url: content.url }, `Downloading ${content.filename}`);
            const response = await axios({ method: 'get', url: content.url, responseType: 'stream' });
            await pipeline(response.data, createWriteStream(join(cacheDir, content.filename)));
        }
        await this.extractZips(cacheDir);
    }

    private async extractZips(dir: string): Promise<void> {
        for (const f of fsReaddir(dir).filter((f) => f.isFile() && f.name.endsWith('.zip'))) {
            const zipPath = join(dir, f.name);
            const extractDir = zipPath.replace('.zip', '');
            fsMkdir(extractDir);
            await this.extractZip(zipPath, extractDir);
        }
    }

    private extractZip(zipPath: string, destDir: string): Promise<void> {
        return new Promise((resolve, reject) => {
            yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
                if (err ?? !zipfile) {
                    reject(err ?? new Error(`Failed to open ${zipPath}`));
                    return;
                }

                zipfile.readEntry();
                zipfile.on('entry', (entry: yauzl.Entry) => {
                    const entryPath = join(destDir, entry.fileName);

                    if (entry.fileName.endsWith('/')) {
                        fsMkdir(entryPath);
                        zipfile.readEntry();
                        return;
                    }

                    if (existsSync(entryPath)) {
                        zipfile.readEntry();
                        return;
                    }

                    fsMkdir(join(entryPath, '..'));
                    zipfile.openReadStream(entry, (streamErr, readStream) => {
                        if (streamErr ?? !readStream) {
                            reject(streamErr ?? new Error(`Failed to read ${entry.fileName}`));
                            return;
                        }

                        const writeStream = createWriteStream(entryPath);
                        readStream.pipe(writeStream);
                        writeStream.on('close', () => zipfile.readEntry());
                        writeStream.on('error', reject);
                    });
                });

                zipfile.on('end', resolve);
                zipfile.on('error', reject);
            });
        });
    }

    private cachedVersions(): string[] {
        if (!fsExists(this.downloadRoot)) return [];
        return fsReaddir(this.downloadRoot)
            .filter((d) => d.isDirectory() && !d.name.includes('.tmp.'))
            .map((d) => d.name);
    }

    private sweepStaleTmpDirs(): void {
        if (!fsExists(this.downloadRoot)) return;
        for (const entry of fsReaddir(this.downloadRoot).filter((d) => d.isDirectory())) {
            const match = /\.tmp\.(\d+)$/.exec(entry.name);
            if (!match) continue;
            const pid = Number.parseInt(match[1], 10);
            if (!Number.isNaN(pid) && !isPidAlive(pid)) {
                try {
                    fsRemove(join(this.downloadRoot, entry.name));
                } catch {
                    // do nothing
                }
            }
        }
    }

    private versionDir(version: string): string {
        return join(this.downloadRoot, version);
    }
}
