import { createWriteStream } from 'fs';
import { join } from 'path';
import { pipeline } from 'stream/promises';
import axios from 'axios';
import { valid, coerce, rcompare, satisfies } from 'semver';
import yauzl from 'yauzl';
import { environment } from '../../utils/ExtensionConfig';
import { fsExists, fsMkdir, fsReaddir, fsRemove, getLspDownloadDir } from '../../utils/FileSystem';
import { LoggerFactory } from '../../utils/Logger';
import { CfnLspServerFile } from '../LspServerProvider';
import { Manifest, TargetContent, Version } from '../manifest/ManifestTypes';

const SupportedServerVersions = '<2.0.0';

export interface LspResolution {
    location: 'cache' | 'remote' | 'fallback';
    version: string;
    serverPath: string;
}

export class LspServerResolver {
    private readonly log = LoggerFactory.getLogger('ServerResolver');
    private readonly versions: Version[];
    private readonly downloadRoot: string;

    constructor(private readonly manifest: Manifest) {
        const env = environment();
        this.versions = manifest[env];
        if (!this.versions?.length) {
            throw new Error(`No versions in manifest for environment '${env}'`);
        }
        this.downloadRoot = getLspDownloadDir();
        fsMkdir(this.downloadRoot);
        this.log.info({ env, versions: this.versions.length }, `Download root: ${this.downloadRoot}`);
    }

    async resolve(): Promise<LspResolution> {
        const latestVersion = this.latestCompatibleVersion();
        const targetContents = this.getTargetContents(latestVersion);
        const cacheDir = this.versionDir(latestVersion.serverVersion);

        // 1. Cache hit — skip extraction if server file already exists
        if (this.hasValidCache(cacheDir, targetContents)) {
            const serverFile = this.findServerFile(cacheDir);
            if (serverFile) {
                this.log.info(`Cache hit: ${latestVersion.serverVersion}`);
                return { location: 'cache', version: latestVersion.serverVersion, serverPath: serverFile };
            }
            // Zips present but not extracted yet
            await this.extractZips(cacheDir);
            this.log.info(`Cache hit (extracted): ${latestVersion.serverVersion}`);
            return { location: 'cache', version: latestVersion.serverVersion, serverPath: this.serverPath(cacheDir) };
        }

        // 2. Remote download
        try {
            await this.downloadVersion(cacheDir, targetContents);
            this.log.info(`Downloaded: ${latestVersion.serverVersion}`);
            return { location: 'remote', version: latestVersion.serverVersion, serverPath: this.serverPath(cacheDir) };
        } catch (err) {
            this.log.error(err, 'Server download failed');
            fsRemove(cacheDir);
        }

        // 3. Fallback to older cached version
        const fallback = this.findFallback(latestVersion.serverVersion);
        if (fallback) {
            this.log.info(`Fallback: ${fallback}`);
            return { location: 'fallback', version: fallback, serverPath: this.serverPath(this.versionDir(fallback)) };
        }

        throw new Error('No server available — check network connectivity and try again');
    }

    cleanOldVersions(currentVersion: string): void {
        const validVersions = new Set(this.versions.filter((v) => !v.isDelisted).map((v) => v.serverVersion));

        for (const dir of this.cachedVersions()) {
            if (dir !== currentVersion && !validVersions.has(dir)) {
                this.log.debug(`Removing old version: ${dir}`);
                fsRemove(this.versionDir(dir));
            }
        }
    }

    private latestCompatibleVersion(): Version {
        const compatible = this.versions
            .filter((v) => !v.isDelisted && valid(coerce(v.serverVersion)))
            .filter((v) => satisfies(coerce(v.serverVersion)!, SupportedServerVersions)) // eslint-disable-line @typescript-eslint/no-non-null-assertion
            .filter((v) => v.targets.some((t) => t.platform === process.platform && t.arch === process.arch))
            .toSorted((a, b) => rcompare(coerce(a.serverVersion) ?? '0.0.0', coerce(b.serverVersion) ?? '0.0.0'));

        if (compatible.length === 0) {
            throw new Error(
                `No compatible server version for ${process.platform}/${process.arch} (range: ${SupportedServerVersions})`,
            );
        }

        const picked = compatible.find((v) => v.latest) ?? compatible[0];

        this.log.debug(
            {
                candidates: compatible.length,
                platform: process.platform,
                arch: process.arch,
                range: SupportedServerVersions,
            },
            `Picked: ${picked.serverVersion} (latest flag: ${picked.latest})`,
        );
        return picked;
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
        const folders = fsReaddir(versionDir).filter((e) => e.isDirectory());
        for (const folder of folders) {
            const candidate = join(versionDir, folder.name, CfnLspServerFile);
            if (fsExists(candidate)) {
                return candidate;
            }
        }

        const direct = join(versionDir, CfnLspServerFile);
        return fsExists(direct) ? direct : undefined;
    }

    private serverPath(versionDir: string): string {
        const found = this.findServerFile(versionDir);
        if (found) {
            return found;
        }
        throw new Error(`Server file not found in ${versionDir}`);
    }

    private async downloadVersion(cacheDir: string, contents: TargetContent[]): Promise<void> {
        fsMkdir(cacheDir);

        for (const content of contents) {
            this.log.info({ bytes: content.bytes, url: content.url }, `Downloading ${content.filename}`);
            const destPath = join(cacheDir, content.filename);

            const response = await axios({
                method: 'get',
                url: content.url,
                responseType: 'stream',
            });

            await pipeline(response.data, createWriteStream(destPath));
        }

        await this.extractZips(cacheDir);
    }

    private async extractZips(dir: string): Promise<void> {
        const zips = fsReaddir(dir)
            .filter((f) => f.isFile() && f.name.endsWith('.zip'))
            .map((f) => f.name);

        for (const zipName of zips) {
            const zipPath = join(dir, zipName);
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

    private findFallback(excludeVersion: string): string | undefined {
        return this.cachedVersions()
            .filter((v) => v !== excludeVersion && valid(coerce(v)))
            .toSorted((a, b) => rcompare(coerce(a) ?? '0.0.0', coerce(b) ?? '0.0.0'))
            .find((v) => this.findServerFile(this.versionDir(v)) !== undefined);
    }

    private cachedVersions(): string[] {
        if (!fsExists(this.downloadRoot)) {
            return [];
        }
        return fsReaddir(this.downloadRoot)
            .filter((d) => d.isDirectory())
            .map((d) => d.name);
    }

    private versionDir(version: string): string {
        return join(this.downloadRoot, version);
    }
}
