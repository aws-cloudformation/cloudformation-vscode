import nodeFs from 'fs';
import { dirname, join } from 'path';
import axios from 'axios';
import { ManifestAdapter, NormalizedManifest, Version } from '../manifest/ManifestTypes';
import {
    BaseLspInstaller,
    FetchBuffer,
    FileSystem,
    LspInstallerConfig,
    LspResolution,
    Sleeper,
} from './BaseLspInstaller';

const CfnServerFile = 'cfn-lsp-server-standalone.js';
const SupportedVersions = '<2.0.0';
const ManifestUrl =
    'https://raw.githubusercontent.com/aws-cloudformation/cloudformation-languageserver/refs/heads/main/assets/release-manifest.json';

/**
 * Default filesystem operations backed by Node's `fs` module.
 */
export class NodeFileSystem extends FileSystem {
    exists(path: string): boolean {
        return nodeFs.existsSync(path);
    }

    mkdirRecursive(path: string): void {
        if (!nodeFs.existsSync(path)) {
            nodeFs.mkdirSync(path, { recursive: true });
        }
    }

    readdir(path: string): nodeFs.Dirent[] {
        return nodeFs.readdirSync(path, { withFileTypes: true });
    }

    writeFile(path: string, data: Buffer): void {
        nodeFs.writeFileSync(path, data);
    }

    readFileString(path: string, encoding: BufferEncoding): string {
        return nodeFs.readFileSync(path, encoding);
    }

    remove(path: string): void {
        if (nodeFs.existsSync(path)) {
            nodeFs.rmSync(path, { recursive: true, force: true });
        }
    }

    rename(oldPath: string, newPath: string): void {
        nodeFs.renameSync(oldPath, newPath);
    }

    chmod(path: string, mode: number): void {
        nodeFs.chmodSync(path, mode);
    }

    stat(path: string): nodeFs.Stats {
        return nodeFs.statSync(path);
    }
}

/** Fetches binary content using axios. */
async function fetchBuffer(url: string, timeoutMs: number): Promise<Buffer> {
    const response = await axios<ArrayBuffer>({
        method: 'get',
        url,
        responseType: 'arraybuffer',
        timeout: timeoutMs,
    });
    return Buffer.from(response.data);
}

/** Selects the requested CFN environment from its channel-keyed manifest. */
export function createCfnManifestAdapter(channel: string): ManifestAdapter {
    return (raw: unknown): NormalizedManifest => {
        const channelVersions = (raw as Record<string, unknown> | null)?.[channel];
        if (!Array.isArray(channelVersions)) {
            throw new TypeError(`Manifest contains no versions for environment '${channel}'`);
        }
        return { versions: channelVersions as Version[] };
    };
}

/**
 * CloudFormation LSP installer — thin specialization providing CFN-specific
 * configuration and a post-install chmod fixup for cfn-init.
 */
export class CfnLspInstaller extends BaseLspInstaller {
    constructor(baseDir: string, channel: string, fs?: FileSystem, fetch?: FetchBuffer, sleeper?: Sleeper) {
        const config: LspInstallerConfig = {
            name: 'cloudformation-languageserver',
            supportedVersions: SupportedVersions,
            manifestUrl: ManifestUrl,
            serverFile: CfnServerFile,
            requiredFiles: ['bin', 'node_modules'],
            manifestAdapter: createCfnManifestAdapter(channel),
            baseRoot: baseDir,
            postInstall: cfnPostInstall,
            sleeper,
        };

        super(config, fs ?? new NodeFileSystem(), fetch ?? fetchBuffer);
    }
}

/**
 * Post-install: mark the bundled `cfn-init` CLI executable for owner, group, and others while keeping its
 * existing read/write bits (zip extraction does not preserve Unix permissions).
 */
function cfnPostInstall(resolution: LspResolution, fs: FileSystem): void {
    if (process.platform === 'win32') {
        return;
    }
    const cfnInitPath = join(dirname(resolution.serverPath), 'bin', 'cfn-init');
    if (fs.exists(cfnInitPath)) {
        try {
            fs.chmod(cfnInitPath, withExecutableBits(fs.stat(cfnInitPath).mode));
        } catch {
            // Best effort
        }
    }
}

export function withExecutableBits(mode: number): number {
    // stat().mode includes file-type bits; chmod only takes permission bits.
    return (mode & 0o7777) | 0o111;
}
