import { dirname, join } from 'path';
import { existsSync, readdirSync } from 'fs';
import { ExtensionContext } from 'vscode';
import { isDevelopment, toString } from './utils';

const serverFile = 'cfn-lsp-server-standalone.js';

function findServerInDevelopment(extensionPath: string): string[] {
    const parentDir = dirname(extensionPath);
    const possibleLocations = [];

    // Get all directories in parent directory
    const siblingDirs = readdirSync(parentDir, { withFileTypes: true })
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name);

    // Check each sibling directory for bundle/development structure
    for (const siblingDir of siblingDirs) {
        const serverPath = join(parentDir, siblingDir, 'bundle', 'development', serverFile);
        if (existsSync(serverPath)) {
            possibleLocations.push(serverPath);
        }
    }

    return possibleLocations;
}

export function locateServer(context: ExtensionContext): string {
    const possibleLocations = [];

    if (isDevelopment()) {
        possibleLocations.push(...findServerInDevelopment(context.extensionPath));
    } else {
        possibleLocations.push(join(context.extensionPath, 'bundle', 'server', serverFile));
    }

    const validLocations = possibleLocations.filter((path) => {
        return existsSync(path);
    });

    if (validLocations.length !== 1) {
        throw Error(
            `Found ${validLocations.length} locations with server executable file: ${toString(possibleLocations)}`,
        );
    }

    return validLocations[0];
}

export function serverRoot(context: ExtensionContext): string {
    return dirname(dirname(locateServer(context)));
}
