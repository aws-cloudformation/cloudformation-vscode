import { lt, coerce } from 'semver';
import { LoggerFactory } from '../../utils/Logger';
import { CLibCheck } from './CLibCheck';
import { Version } from './ManifestTypes';

const LegacyLinuxGLibPlatform = 'linuxglib2.28';

export function useOldLinuxVersion(): boolean {
    if (process.platform !== 'linux') {
        return false;
    }

    if (process.env.SNAP !== undefined) {
        return true;
    }

    const glibcxx = CLibCheck.getGLibCXXVersions();
    if (!glibcxx.maxFound) {
        return false;
    }

    LoggerFactory.getLogger('LinuxCompat').info(`Found GLIBCXX max: ${glibcxx.maxFound}`);
    return lt(coerce(glibcxx.maxFound) ?? '0.0.0', '3.4.29');
}

export function mapLegacyLinux(versions: Version[]): Version[] {
    return versions.map((version) => {
        const hasLegacyLinux = version.targets.some((t) => t.platform === LegacyLinuxGLibPlatform);
        if (!hasLegacyLinux) {
            return version;
        }

        return {
            ...version,
            targets: version.targets
                .filter((t) => t.platform !== 'linux')
                .map((t) => (t.platform === LegacyLinuxGLibPlatform ? { ...t, platform: 'linux' } : t)),
        };
    });
}
