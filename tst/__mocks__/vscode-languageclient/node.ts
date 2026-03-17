import { vi } from 'vitest';

// Mock implementation of the vscode-languageclient/node module
const vscodeLanguageClient = {
    LanguageClient: vi.fn().mockImplementation(() => ({
        start: vi.fn(),
        stop: vi.fn(),
        sendRequest: vi.fn().mockResolvedValue({}),
        onReady: vi.fn().mockResolvedValue(undefined),
        isRunning: vi.fn().mockReturnValue(true),
    })),
    TransportKind: { ipc: 1, stdio: 0 },
    ErrorAction: { Continue: 1, Shutdown: 2 },
    CloseAction: { DoNotRestart: 1, Restart: 2 },
};

module.exports = vscodeLanguageClient;
