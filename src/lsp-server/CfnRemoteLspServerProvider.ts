import { ExtensionContext } from 'vscode';
import { join } from 'path';
import { mkdirSync, existsSync } from 'fs';
import { LspServerProviderI } from './LspServerProvider';
import { isDevelopment } from '../utils';
import { LocalServerManager } from './remote/LocalServerManager';
import { CachedCfnLspServerDirName } from './LspServerConfig';
import { RemoteManifest } from './remote/RemoteManifest';

const RemoteAssetUrl = 'https://d2485r7obgomg5.cloudfront.net';

export class CfnRemoteLspServerProvider implements LspServerProviderI {
    private readonly manifest: RemoteManifest;
    private readonly serverManager: LocalServerManager;
    private readonly serversRoot: string;

    constructor(private readonly context: ExtensionContext) {
        this.serversRoot = join(context.extensionPath, 'bundle', CachedCfnLspServerDirName);
        if (!existsSync(this.serversRoot)) {
            mkdirSync(this.serversRoot, { recursive: true });
        }

        this.manifest = new RemoteManifest(RemoteAssetUrl, this.serversRoot);
        this.serverManager = new LocalServerManager(context, this.manifest, this.serversRoot);
    }

    canProvide(): boolean {
        return !isDevelopment();
    }

    serverExecutable(): Promise<string> {
        return this.serverManager.serverExecutable();
    }

    serverRootDir(): Promise<string> {
        return this.serverManager.serverRootDir();
    }

    close() {
        this.manifest.close();
        this.serverManager.close();
    }
}
