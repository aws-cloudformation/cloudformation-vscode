import { Disposable } from 'vscode';
import { toString } from '../utils';

export interface LspServerResolverI {
    serverExecutable(): Promise<string>;
    serverRootDir(): Promise<string>;
}

export interface LspServerProviderI extends LspServerResolverI {
    canProvide(): boolean;
    close(): Promise<unknown> | void;
}

export class LspServerResolver implements LspServerResolverI, Disposable {
    private readonly provider: LspServerProviderI;

    constructor(private readonly providers: LspServerProviderI[]) {
        const matches = this.providers.filter((provider) => {
            return provider.canProvide();
        });

        if (matches.length !== 1) {
            throw new Error(`Matched with ${matches.length} CloudFormation LSP providers: ${toString(matches)}`);
        }

        this.provider = matches[0];
        console.debug(`Found CloudFormation LSP provider: ${this.provider.constructor.name}`);
    }

    serverExecutable(): Promise<string> {
        return this.provider.serverExecutable();
    }

    serverRootDir(): Promise<string> {
        return this.provider.serverRootDir();
    }

    dispose() {
        return this.provider.close();
    }
}
