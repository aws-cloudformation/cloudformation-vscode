import nodeFs from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { ExtensionContext } from 'vscode';

let homeDir: string | undefined;
let isWebMode = false;

export function initFileSystem(context: ExtensionContext): void {
    isWebMode = context.extensionUri.scheme !== 'file';

    if (isWebMode) {
        homeDir = context.globalStorageUri.fsPath;
        return;
    }

    homeDir = process.env.HOME ?? process.env.USERPROFILE ?? homedir();
}

export function isWeb(): boolean {
    return isWebMode;
}

export function getUserHomeDir(): string {
    if (!homeDir) {
        throw new Error('Call initFileSystem() before using getUserHomeDir()');
    }
    return homeDir;
}

function getCacheDir(): string {
    if (isWebMode) {
        return getUserHomeDir();
    }

    switch (process.platform) {
        case 'darwin': {
            return join(getUserHomeDir(), 'Library', 'Caches');
        }
        case 'win32': {
            const localAppData = process.env.LOCALAPPDATA;
            if (!localAppData) {
                throw new Error('LOCALAPPDATA environment variable not set');
            }
            return localAppData;
        }
        case 'linux': {
            return join(getUserHomeDir(), '.cache');
        }
        default: {
            throw new Error(`Unsupported platform: ${process.platform}`);
        }
    }
}

/**
 * Root shared by every IDE client of the language server, so they reuse one server download under
 * `<platform-cache>/aws/language-servers/<server name>`.
 */
export function getLspBaseDir(): string {
    return join(getCacheDir(), 'aws');
}

export function fsExists(path: string): boolean {
    return nodeFs.existsSync(path);
}

export function fsMkdir(path: string): void {
    if (!nodeFs.existsSync(path)) {
        nodeFs.mkdirSync(path, { recursive: true });
    }
}

export function fsReaddir(path: string): nodeFs.Dirent[] {
    return nodeFs.readdirSync(path, { withFileTypes: true });
}

export function fsReadFile(path: string): Buffer {
    return nodeFs.readFileSync(path);
}

export function fsReadFileString(path: string, encoding: BufferEncoding): string {
    return nodeFs.readFileSync(path, encoding);
}

export function fsWriteFile(path: string, data: Buffer): void {
    nodeFs.writeFileSync(path, data);
}

export function fsRemove(path: string): void {
    if (nodeFs.existsSync(path)) {
        nodeFs.rmSync(path, { recursive: true, force: true });
    }
}
