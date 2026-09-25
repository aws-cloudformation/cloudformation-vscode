import { Disposable } from 'vscode';
import { LoggerFactory } from '../utils/Logger';

export interface LspServerResolverI {
    serverExecutable(): Promise<string>;
    serverRootDir(): Promise<string>;
}

export const CfnLspServerFile = 'cfn-lsp-server-standalone.js';

export interface LspServerProviderI extends LspServerResolverI {
    canProvide(): boolean;
    name(): string;
    close(): Promise<unknown> | void;
}

export class LspServerResolver implements LspServerResolverI, Disposable {
    private readonly log = LoggerFactory.getLogger('LspServerProvider');
    private readonly matchedProviders: LspServerProviderI[];
    private resolved?: { executable: string; rootDir: string };

    constructor(providers: LspServerProviderI[]) {
        this.matchedProviders = providers.filter((p) => p.canProvide());

        if (this.matchedProviders.length === 0) {
            throw new Error('No server providers available');
        }

        this.log.info(`Available providers: ${this.matchedProviders.map((p) => p.name()).join(', ')}`);
    }

    async serverExecutable(): Promise<string> {
        const result = await this.evaluateProviders();
        return result.executable;
    }

    async serverRootDir(): Promise<string> {
        const result = await this.evaluateProviders();
        return result.rootDir;
    }

    /**
     * Resets the cached resolution so the next call to serverExecutable() will
     * re-evaluate all providers. Used by LspLauncher after invalidation.
     */
    resetResolution(): void {
        this.resolved = undefined;
    }

    private async evaluateProviders(): Promise<{ executable: string; rootDir: string }> {
        if (this.resolved) {
            return this.resolved;
        }

        for (const provider of this.matchedProviders) {
            try {
                const executable = await provider.serverExecutable();
                const rootDir = await provider.serverRootDir();
                this.resolved = { executable, rootDir };
                this.log.info(`Using ${provider.name()}`);
                return this.resolved;
            } catch (err) {
                this.log.warn(err, `${provider.name()} failed`);
            }
        }

        throw new Error('All server providers failed');
    }

    dispose() {
        for (const provider of this.matchedProviders) {
            void provider.close();
        }
    }
}
