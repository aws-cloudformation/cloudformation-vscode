import { readdirSync, lstatSync, cpSync, existsSync } from 'fs';
import { rm } from 'fs/promises';
import { ExtensionContext } from 'vscode';
import { join, dirname } from 'path';
import { RemoteManifest } from './RemoteManifest';
import { LspServerResolverI } from '../LspServerProvider';
import { downloadAndUnzip } from './DownloadServer';
import { CfnLspServerFile, CfnLspServerStorageName } from '../LspServerConfig';
import { toString } from '../../utils';

export class LocalServerManager implements LspServerResolverI {
    private readonly timeout: NodeJS.Timeout;

    constructor(
        private readonly context: ExtensionContext,
        private readonly manifest: RemoteManifest,
        private readonly serversRoot: string,
    ) {
        const serverVersion = this.cachedVersion();
        if (serverVersion) {
            if (!this.isTargetServerAvailable(serverVersion)) {
                console.warn(
                    `CloudFormation LSP version mismatch, expecting ${serverVersion} but found: ${toString(this.availableServers())} `,
                );
                this.context.globalState.update(ServerVersionKey, undefined);
            }
        }

        // clean up old lsp servers
        this.timeout = setInterval(
            () => {
                void this.cleanup();
            },
            10 * 60 * 1000,
        );
    }

    async serverExecutable(): Promise<string> {
        const currentVersion = this.cachedVersion();
        console.info(`Looking for CloudFormation LSP ${currentVersion}...`);

        // No servers available (or version is invalid)
        if (!currentVersion || !this.isTargetServerAvailable(currentVersion)) {
            const newVersion = await this.downloadLatestServer();
            console.info(`Installed CloudFormation LSP ${newVersion}`);

            // Update cache
            this.context.globalState.update(ServerVersionKey, newVersion);
            return join(this.serversRoot, newVersion, CfnLspServerFile);
        }

        const latestServer = await this.manifest.latestServer();
        const latestVersion = latestServer.version;

        // Cache and Remote version mismatch
        if (latestVersion !== currentVersion) {
            if (this.isTargetServerAvailable(latestVersion)) {
                console.info(`Switching from CloudFormation LSP ${currentVersion} to ${latestVersion}...`);
                // Remote version is available, copy the old DB
                const oldServerDb = join(this.serversRoot, currentVersion, CfnLspServerStorageName);
                const newServerDb = join(this.serversRoot, latestVersion, CfnLspServerStorageName);
                if (existsSync(oldServerDb)) {
                    cpSync(oldServerDb, newServerDb, { recursive: true });
                }

                // Update the cache
                this.context.globalState.update(ServerVersionKey, latestVersion);
                return join(this.serversRoot, latestVersion, CfnLspServerFile);
            } else {
                console.error(`Downloading latest CloudFormation LSP ${latestVersion}...`);
                // Remote version is not available, use the old version, but download the latest
                this.downloadLatestServer().catch(console.error);
                return join(this.serversRoot, currentVersion, CfnLspServerFile);
            }
        } else {
            // 3. Cached version matches latest
            return join(this.serversRoot, currentVersion, CfnLspServerFile);
        }
    }

    async serverRootDir(): Promise<string> {
        return dirname(await this.serverExecutable());
    }

    public availableServers() {
        return readdirSync(this.serversRoot).filter((file) => {
            return lstatSync(join(this.serversRoot, file)).isDirectory();
        });
    }

    private isTargetServerAvailable(target: string) {
        return this.availableServers().includes(target);
    }

    private async downloadLatestServer() {
        const server = await this.manifest.latestServer();
        const newLocation = join(this.serversRoot, server.version);
        try {
            await downloadAndUnzip(server.url, newLocation);
            return server.version;
        } catch (err) {
            throw new Error(
                `Failed to install AWS CloudFormation LSP ${server.version}: ${toString((err as Error).message)}`,
            );
        }
    }

    private cachedVersion() {
        return this.context.globalState.get<string>(ServerVersionKey);
    }

    private async cleanup() {
        const servers = this.availableServers();
        if (servers.length < 1) {
            return;
        }

        const latestVersion = (await this.manifest.environment()).latest;
        const currentVersion = this.cachedVersion();

        const invalidServers = servers.filter((server) => {
            return server !== latestVersion && server !== currentVersion;
        });

        for (const invalidServer of invalidServers) {
            const invalidPath = join(this.serversRoot, invalidServer);
            console.warn(`Deleting stale CloudFormation LSP ${invalidPath}`);
            await rm(invalidPath, { recursive: true });
        }
    }

    public close() {
        clearInterval(this.timeout);
    }
}

export const ServerVersionKey = 'aws.cloudformation.lsp.server.version';
