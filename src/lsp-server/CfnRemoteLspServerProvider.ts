import { dirname } from 'path';
import { getLspBaseDir } from '../utils/FileSystem';
import { LoggerFactory } from '../utils/Logger';
import { LspResolution } from './installer/BaseLspInstaller';
import { CfnLspInstaller } from './installer/CfnLspInstaller';
import { LspServerProviderI } from './LspServerProvider';

export class CfnRemoteLspServerProvider implements LspServerProviderI {
    private readonly log = LoggerFactory.getLogger('RemoteLspServerProvider');
    private readonly installer: CfnLspInstaller;
    private serverPath?: string;
    private rootDir?: string;

    constructor(channel: string, installer?: CfnLspInstaller) {
        this.installer = installer ?? new CfnLspInstaller(getLspBaseDir(), channel);
    }

    name(): string {
        return 'RemoteCfnLspServerProvider';
    }

    canProvide(): boolean {
        return true;
    }

    async serverExecutable(): Promise<string> {
        if (this.serverPath) {
            return this.serverPath;
        }

        const result = await this.resolveServer();
        this.installer.cleanup(result.version);

        this.serverPath = result.serverPath;
        this.rootDir = dirname(result.serverPath);
        return this.serverPath;
    }

    private async resolveServer(): Promise<LspResolution> {
        try {
            return await this.installer.resolve();
        } catch (err) {
            this.log.warn(err, 'Standard resolve failed, searching for installed LSP');
            const fallback = this.installer.findInstalledFallback();
            if (!fallback) {
                throw err;
            }
            this.log.info(`Using locally installed fallback: ${fallback.versionDir}`);
            return {
                location: 'fallback',
                version: fallback.version,
                versionDir: fallback.versionDir,
                serverPath: fallback.serverPath,
            };
        }
    }

    async serverRootDir(): Promise<string> {
        if (!this.rootDir) {
            await this.serverExecutable();
        }
        if (!this.rootDir) {
            throw new Error('Failed to resolve LSP server root directory');
        }
        return this.rootDir;
    }

    invalidate(): void {
        this.installer.invalidateResolvedInstallation();
        this.serverPath = undefined;
        this.rootDir = undefined;
    }

    close() {
        // No-op: cleanup is handled during resolve
    }
}
