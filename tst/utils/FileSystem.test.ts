import { join } from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExtensionContext } from 'vscode';
import { getLspBaseDir, initFileSystem } from '../../src/utils/FileSystem';

vi.mock('vscode');

const home = '/home/tester';
const localAppData = String.raw`C:\Users\tester\AppData\Local`;

const expectedAwsCacheRoot: Partial<Record<NodeJS.Platform, string>> = {
    darwin: join(home, 'Library', 'Caches', 'aws'),
    linux: join(home, '.cache', 'aws'),
    win32: join(localAppData, 'aws'),
};

describe('getLspBaseDir', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('resolves to the aws cache root shared by IDE clients of the language server', () => {
        vi.stubEnv('HOME', home);
        vi.stubEnv('LOCALAPPDATA', localAppData);
        initFileSystem({ extensionUri: { scheme: 'file' } } as ExtensionContext);

        expect(getLspBaseDir()).toBe(expectedAwsCacheRoot[process.platform]);
    });
});
