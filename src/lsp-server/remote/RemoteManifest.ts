import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import axios from 'axios';
import { arch, platform } from 'os';
import { toString } from '../../utils';

type TargetType = {
    version: string;
    platform: string;
    arch: string;
    filename: string;
    path: string;
};

type EnvironmentType = {
    versions: string[];
    latest: string | null;
    targets: {
        [key: string]: TargetType[];
    };
};

type ManifestType = {
    description: string;
    environments: {
        alpha: EnvironmentType;
        beta: EnvironmentType;
        prod: EnvironmentType;
    };
};

const ManifestFileName = 'manifest.json';

export class RemoteManifest {
    private readonly manifestUrl: string;
    private readonly manifestFile: string;

    private _manifest?: ManifestType;
    private readonly timeout: NodeJS.Timeout;

    constructor(
        private readonly baseRemoteUrl: string,
        storageLocation: string,
    ) {
        this.manifestUrl = `${baseRemoteUrl}/${ManifestFileName}`;
        this.manifestFile = join(storageLocation, ManifestFileName);

        // Load from local manifest first
        if (existsSync(this.manifestFile)) {
            this._manifest = JSON.parse(readFileSync(this.manifestFile, 'utf-8')) as ManifestType;
        }

        this.getAndSave(); // Always try to get the latest manifest from online on startup

        // Refresh manifest eventually
        this.timeout = setInterval(
            () => {
                this.getAndSave();
            },
            10 * 60 * 1000,
        );
    }

    async get(): Promise<ManifestType> {
        if (this._manifest) {
            return this._manifest;
        }

        this._manifest = await this.getFromRemote();
        return this._manifest;
    }

    async latestServer() {
        const env = await this.environment();
        const latest = env.latest;
        const targets = env.targets;
        if (!latest || !targets[latest]) {
            throw new Error(`No target found for ${toString(env)}`);
        }

        const platform = getPlatform();
        const arch = getArch();
        const matches = targets[latest].filter((target) => {
            return target.arch === arch && target.platform === platform;
        });

        if (matches.length !== 1) {
            throw new Error(
                `Could not find 1 matching target for platform=${platform} arch=${arch} ${toString(matches)}`,
            );
        }

        const server = matches[0];

        return {
            url: `${this.baseRemoteUrl}${server.path}`,
            version: env.latest as string,
        };
    }

    async environment(): Promise<EnvironmentType> {
        const manifest = await this.get();
        let environment: EnvironmentType | undefined;
        switch (process.env.AWS_ENV) {
            case 'alpha':
                environment = manifest.environments.alpha;
                break;
            case 'beta':
                environment = manifest.environments.beta;
                break;
            case 'prod':
                environment = manifest.environments.prod;
                break;
            default:
                throw new Error(`Unknown environment=${process.env.AWS_ENV}`);
        }

        if (!environment) {
            throw new Error(`No environment found for ${process.env.AWS_ENV} ${toString(manifest)}`);
        }
        return environment;
    }

    private getAndSave() {
        this.getFromRemote()
            .then((data) => {
                this._manifest = data;
                writeFileSync(this.manifestFile, JSON.stringify(data, null, 2), 'utf-8');
            })
            .catch((err) => {
                console.error('Error getting or saving CloudFormation LSP manifest', err);
            });
    }

    private async getFromRemote(): Promise<ManifestType> {
        const result = await axios.get<ManifestType>(this.manifestUrl);
        return result.data;
    }

    close() {
        clearInterval(this.timeout);
    }
}

function getPlatform() {
    const p = platform();
    if (['macos', 'mac', 'darwin'].includes(p)) {
        return 'darwin';
    } else if (['windows', 'win32', 'win64'].includes(p)) {
        return 'win32';
    } else {
        return 'linux';
    }
}

function getArch() {
    const a = arch();
    if (['arm'].includes(a)) {
        return 'arm';
    } else if (['arm64', 'aarch64', 'arch64'].includes(a)) {
        return 'arm64';
    } else {
        return 'x64';
    }
}
