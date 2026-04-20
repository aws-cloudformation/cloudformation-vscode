import { dirname } from 'path';
import { LspServerProviderI } from './LspServerProvider';
import { InUseTracker } from './resolver/InUseTracker';
import { LspServerResolver } from './resolver/LspServerResolver';

export class CfnRemoteLspServerProvider implements LspServerProviderI {
    private readonly inUseTracker = new InUseTracker();
    private resolved?: { serverPath: string; rootDir: string; versionDir: string };

    name(): string {
        return 'RemoteCfnLspServerProvider';
    }

    canProvide(): boolean {
        return true;
    }

    async serverExecutable(): Promise<string> {
        if (this.resolved) {
            return this.resolved.serverPath;
        }

        const resolver = new LspServerResolver();
        const result = await resolver.resolve();

        const versionDir = resolver.versionDirFor(result.version);
        // Write marker BEFORE cleanup so peer processes see us as in-use
        this.inUseTracker.writeMarker(versionDir, 'cloudformation-vscode');
        resolver.cleanOldVersions(result.version);

        this.resolved = { serverPath: result.serverPath, rootDir: dirname(result.serverPath), versionDir };
        return result.serverPath;
    }

    async serverRootDir(): Promise<string> {
        if (!this.resolved) {
            await this.serverExecutable();
        }
        if (!this.resolved) {
            throw new Error('Failed to resolve LSP server root directory');
        }
        return this.resolved.rootDir;
    }

    close() {
        if (this.resolved) {
            this.inUseTracker.removeMarker(this.resolved.versionDir);
        }
    }
}
