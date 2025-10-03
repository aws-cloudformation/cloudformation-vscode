import { dirname, join } from 'path';
import { existsSync, readdirSync } from 'fs';
import { ExtensionContext } from 'vscode';
import { LspServerProviderI } from './LspServerProvider';
import { isDevelopment, toString } from '../utils';
import { CfnLspServerFile } from './LspServerConfig';

export class CfnDevLspServerProvider implements LspServerProviderI {
    constructor(private readonly context: ExtensionContext) {}

    canProvide(): boolean {
        return isDevelopment();
    }

    serverExecutable(): Promise<string> {
        return Promise.resolve(this.findServerInDevelopment());
    }

    serverRootDir(): Promise<string> {
        return Promise.resolve(dirname(this.findServerInDevelopment()));
    }

    private findServerInDevelopment(): string {
        const parentDir = dirname(this.context.extensionPath);
        const possibleLocations = [];

        // Get all directories in parent directory
        const siblingDirs = readdirSync(parentDir, { withFileTypes: true })
            .filter((dirent) => dirent.isDirectory())
            .map((dirent) => dirent.name);

        // Check each sibling directory for bundle/development structure
        for (const siblingDir of siblingDirs) {
            const serverPath = join(parentDir, siblingDir, 'bundle', 'development', CfnLspServerFile);
            if (existsSync(serverPath)) {
                possibleLocations.push(serverPath);
            }
        }

        const validLocations = possibleLocations.filter((path) => {
            return existsSync(path);
        });

        if (validLocations.length !== 1) {
            throw Error(
                `Found ${validLocations.length} locations with server executable file: ${toString(possibleLocations)}`,
            );
        }

        console.debug(`Found dev server ${validLocations[0]}`);
        return validLocations[0];
    }

    close() {}
}
