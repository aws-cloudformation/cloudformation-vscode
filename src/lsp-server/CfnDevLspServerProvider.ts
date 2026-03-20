import { dirname, join } from 'path';
import { ExtensionContext } from 'vscode';
import { fsExists, fsReaddir } from '../utils/FileSystem';
import { isDevelopment, toString } from '../utils/Utils';
import { CfnLspServerFile, LspServerProviderI } from './LspServerProvider';

export class CfnDevLspServerProvider implements LspServerProviderI {
    private readonly devServerLocation?: string;

    constructor(context: ExtensionContext) {
        this.devServerLocation = findServerInDevelopment(context.extensionPath);
    }

    name(): string {
        return 'DevCfnLspServerProvider';
    }

    canProvide(): boolean {
        return isDevelopment() && this.devServerLocation !== undefined;
    }

    serverExecutable(): Promise<string> {
        if (!this.devServerLocation) {
            return Promise.reject(new Error('No dev server location'));
        }
        return Promise.resolve(this.devServerLocation);
    }

    serverRootDir(): Promise<string> {
        if (!this.devServerLocation) {
            return Promise.reject(new Error('No dev server location'));
        }
        return Promise.resolve(dirname(this.devServerLocation));
    }

    close() {}
}

function findServerInDevelopment(extensionPath: string): string | undefined {
    const parentDir = dirname(extensionPath);

    const siblingDirs = fsReaddir(parentDir)
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name);

    const validLocations: string[] = [];
    for (const siblingDir of siblingDirs) {
        const serverPath = join(parentDir, siblingDir, 'bundle', 'development', CfnLspServerFile);
        if (fsExists(serverPath)) {
            validLocations.push(serverPath);
        }
    }

    if (validLocations.length === 1) {
        return validLocations[0];
    }

    if (validLocations.length > 1) {
        throw new Error(`Found ${validLocations.length} dev server locations: ${toString(validLocations)}`);
    }

    return undefined;
}
