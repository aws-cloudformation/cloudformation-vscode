import { vi } from 'vitest';

// Mock implementation of the vscode-languageclient module
const vscodeLanguageClientMain = {
    ExecuteCommandRequest: {
        method: 'workspace/executeCommand',
        type: {
            get: vi.fn(),
        },
    },
};

module.exports = vscodeLanguageClientMain;
