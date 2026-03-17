import { vi } from 'vitest';

const mockConfiguration = {
    get: vi.fn().mockReturnValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    has: vi.fn().mockReturnValue(false),
    inspect: vi.fn().mockReturnValue(undefined),
};

// Mock implementation of the vscode module
const vscode = {
    window: {
        createStatusBarItem: vi.fn().mockReturnValue({
            text: '',
            tooltip: '',
            command: '',
            show: vi.fn(),
            hide: vi.fn(),
            dispose: vi.fn(),
        }),
        createOutputChannel: vi.fn().mockReturnValue({
            appendLine: vi.fn(),
            dispose: vi.fn(),
        }),
        showQuickPick: vi.fn(),
        showInformationMessage: vi.fn(),
        showErrorMessage: vi.fn(),
        showWarningMessage: vi.fn(),
        setStatusBarMessage: vi.fn(),
        showOpenDialog: vi.fn(),
        tabGroups: {
            all: [],
        },
    },
    workspace: {
        asRelativePath: vi.fn(),
        getConfiguration: vi.fn().mockReturnValue(mockConfiguration),
    },
    env: {
        openExternal: vi.fn().mockResolvedValue(true),
        machineId: 'test-machine-id',
    },
    Uri: {
        parse: vi.fn().mockImplementation((s: string) => ({ toString: () => s, scheme: 'https', fsPath: s })),
    },
    StatusBarAlignment: {
        Left: 1,
        Right: 2,
    },
    commands: {
        registerCommand: vi.fn().mockReturnValue({ dispose: vi.fn() }),
    },
    ExtensionContext: vi.fn(),
    Memento: vi.fn(),
    Disposable: vi.fn(),
    TabInputText: vi.fn(),
    Position: vi.fn().mockImplementation((line: number, character: number) => ({
        line,
        character,
    })),
};

module.exports = vscode;
