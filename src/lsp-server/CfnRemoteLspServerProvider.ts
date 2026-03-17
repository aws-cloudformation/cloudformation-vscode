import { dirname } from 'path';
import { LoggerFactory } from '../utils/Logger';
import { LspServerProviderI } from './LspServerProvider';
import { GitHubManifest } from './manifest/GitHubManifest';
import { LspServerResolver } from './resolver/LspServerResolver';

export class CfnRemoteLspServerProvider implements LspServerProviderI {
    private readonly log = LoggerFactory.getLogger('RemoteLspServerProvider');
    private serverPath?: string;
    private rootDir?: string;

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

        const manifest = await new GitHubManifest().getManifest();
        const resolver = new LspServerResolver(manifest);
        const result = await resolver.resolve();

        resolver.cleanOldVersions(result.version);

        this.serverPath = result.serverPath;
        this.rootDir = dirname(result.serverPath);
        return this.serverPath;
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

    close() {}
}
