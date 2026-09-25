import { dirname, join } from 'path';
import { ExtensionContext } from 'vscode';
import { fsExists, fsReaddir } from '../utils/FileSystem';
import { LoggerFactory } from '../utils/Logger';
import { CfnLspServerFile, LspServerProviderI } from './LspServerProvider';

/**
 * Maximum number of parent directories to walk when searching for a dev server.
 * Prevents unbounded traversal toward the filesystem root.
 */
const MaxParentWalkDepth = 3;

/**
 * Environment variable that provides an explicit path to the LSP server for dev use.
 */
const DevServerPathEnv = 'CFN_LSP_SERVER_PATH';

/**
 * Development LSP server provider.
 *
 * Discovery is restricted to alpha/dev environments:
 * 1. Explicit path via CFN_LSP_SERVER_PATH environment variable
 * 2. Bounded walk-up of parent directories (max 3 levels) from the extension path
 *
 * If CFN_LSP_SERVER_PATH is set but invalid, falls through to the walk-up search
 * (matching "Invalid explicit path should continue to parent search" requirement).
 */
export class CfnDevLspServerProvider implements LspServerProviderI {
    private readonly log = LoggerFactory.getLogger('DevCfnLspServerProvider');
    private readonly devServerLocation?: string;
    private readonly isDevEnvironment: boolean;

    constructor(context: ExtensionContext) {
        this.isDevEnvironment = isAlphaOrDev();
        this.devServerLocation = this.isDevEnvironment ? this.discoverServer(context.extensionPath) : undefined;
    }

    name(): string {
        return 'DevCfnLspServerProvider';
    }

    canProvide(): boolean {
        return this.isDevEnvironment && this.devServerLocation !== undefined;
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

    /**
     * Discovery strategy:
     * 1. Explicit: CFN_LSP_SERVER_PATH environment variable (if valid)
     * 2. Walk-up: Bounded parent directory search (also used if explicit path invalid)
     */
    private discoverServer(extensionPath: string): string | undefined {
        const explicitPath = process.env[DevServerPathEnv];
        if (explicitPath) {
            if (fsExists(explicitPath)) {
                this.log.info(`Using explicit dev server from ${DevServerPathEnv}: ${explicitPath}`);
                return explicitPath;
            }
            // Invalid explicit path → continue to walk-up search
            this.log.warn(`${DevServerPathEnv} set but path does not exist: ${explicitPath}, trying walk-up`);
        }

        return this.walkUpDiscovery(extensionPath);
    }

    /**
     * Walk up from the extension path checking each level's sibling directories
     * for a development server bundle.
     */
    private walkUpDiscovery(extensionPath: string): string | undefined {
        let searchDir = dirname(extensionPath);

        for (let depth = 0; depth < MaxParentWalkDepth; depth++) {
            const found = this.findServerInDirectory(searchDir);
            if (found) {
                return found;
            }

            const parent = dirname(searchDir);
            if (parent === searchDir) {
                break;
            }
            searchDir = parent;
        }

        return undefined;
    }

    private findServerInDirectory(parentDir: string): string | undefined {
        let siblingDirs: string[];
        try {
            siblingDirs = fsReaddir(parentDir)
                .filter((dirent) => dirent.isDirectory())
                .map((dirent) => dirent.name);
        } catch {
            return undefined;
        }

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
            this.log.warn(`Found ${validLocations.length} dev server locations, skipping ambiguous resolution`);
        }

        return undefined;
    }
}

/**
 * Returns true if the effective channel is alpha or truly dev mode.
 *
 * Rules:
 * - CFN_LSP_ENVIRONMENT=alpha or AWS_ENV=alpha → dev
 * - NODE_ENV=development or NODE_ENV=test → dev
 * - AWS_ENV=prod with NODE_ENV unset → NOT dev (production)
 * - AWS_ENV unset with NODE_ENV unset → NOT dev (assume production)
 */
function isAlphaOrDev(): boolean {
    const awsEnv = process.env.AWS_ENV?.toLowerCase();
    const cfnEnv = process.env.CFN_LSP_ENVIRONMENT?.trim().toLowerCase();
    const nodeEnv = process.env.NODE_ENV?.toLowerCase();

    // Explicit alpha channel
    if (awsEnv === 'alpha' || cfnEnv === 'alpha') {
        return true;
    }

    // AWS_ENV=prod always means production regardless of NODE_ENV
    if (awsEnv === 'prod') {
        return false;
    }

    // Explicit dev/test NODE_ENV
    if (nodeEnv === 'development' || nodeEnv === 'test') {
        return true;
    }

    // NODE_ENV unset with no alpha signal: assume production
    return false;
}
