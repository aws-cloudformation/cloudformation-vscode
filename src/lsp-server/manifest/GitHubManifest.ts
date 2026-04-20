import { join } from 'path';
import axios from 'axios';
import { fsExists, fsReadFileString, fsWriteFileAtomic, fsMkdir } from '../../utils/FileSystem';
import { LoggerFactory } from '../../utils/Logger';
import { useOldLinuxVersion, mapLegacyLinux } from './LinuxCompat';
import { Manifest } from './ManifestTypes';

const ManifestUrl =
    'https://raw.githubusercontent.com/aws-cloudformation/cloudformation-languageserver/refs/heads/main/assets/release-manifest.json';

const ManifestCacheFile = 'manifest.json';

export class GitHubManifest {
    constructor(private readonly downloadRoot: string) {}

    private get log() {
        return LoggerFactory.getLogger('GitHubManifest');
    }

    private get cachePath(): string {
        return join(this.downloadRoot, ManifestCacheFile);
    }

    async fetchManifest(): Promise<Manifest> {
        try {
            const response = await axios({ method: 'get', url: ManifestUrl, responseType: 'text' });
            const rawText = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);

            try {
                fsMkdir(this.downloadRoot);
                fsWriteFileAtomic(this.cachePath, rawText);
            } catch (cacheErr) {
                this.log.warn(cacheErr, 'Failed to cache manifest');
            }

            return this.applyLinuxCompat(JSON.parse(rawText) as Manifest);
        } catch (fetchErr) {
            this.log.warn(fetchErr, 'Manifest fetch failed, trying cached manifest');
        }

        try {
            if (fsExists(this.cachePath)) {
                const raw = fsReadFileString(this.cachePath, 'utf8');
                this.log.info('Using cached manifest for offline mode');
                return this.applyLinuxCompat(JSON.parse(raw) as Manifest);
            }
        } catch (cacheErr) {
            this.log.warn(cacheErr, 'Failed to read cached manifest');
        }

        throw new Error('Failed to fetch manifest and no cached manifest available');
    }

    private applyLinuxCompat(manifest: Manifest): Manifest {
        if (process.platform !== 'linux' || !useOldLinuxVersion()) {
            return manifest;
        }
        this.log.info('Legacy Linux environment detected, remapping targets');
        return {
            ...manifest,
            alpha: mapLegacyLinux(manifest.alpha),
            beta: mapLegacyLinux(manifest.beta),
            prod: mapLegacyLinux(manifest.prod),
        };
    }
}
