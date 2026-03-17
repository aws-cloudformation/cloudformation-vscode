import axios from 'axios';
import { LoggerFactory } from '../../utils/Logger';
import { useOldLinuxVersion, mapLegacyLinux } from './LinuxCompat';
import { Manifest, Version } from './ManifestTypes';

const ManifestUrl =
    'https://raw.githubusercontent.com/aws-cloudformation/cloudformation-languageserver/refs/heads/main/assets/release-manifest.json';

export class GitHubManifest {
    private get log() {
        return LoggerFactory.getLogger('GitHubManifest');
    }

    async getManifest(): Promise<Manifest> {
        const json = await axios<Manifest>({
            method: 'get',
            url: ManifestUrl,
        });

        const manifest = json.data;
        manifest.alpha = this.applyLinuxCompat(manifest.alpha);
        manifest.beta = this.applyLinuxCompat(manifest.beta);
        manifest.prod = this.applyLinuxCompat(manifest.prod);

        this.log.info(
            {
                alpha: manifest.alpha.length,
                beta: manifest.beta.length,
                prod: manifest.prod.length,
            },
            'Manifest fetched',
        );

        return {
            ...manifest,
        };
    }

    private applyLinuxCompat(versions: Version[]): Version[] {
        if (process.platform !== 'linux' || !useOldLinuxVersion()) {
            return versions;
        }

        this.log.info('Legacy Linux environment detected, remapping targets');
        return mapLegacyLinux(versions);
    }
}
