// Mock implementation of the vscode module
const vscode = {
    window: {
        createStatusBarItem: jest.fn().mockReturnValue({
            text: '',
            tooltip: '',
            command: '',
            show: jest.fn(),
            hide: jest.fn(),
            dispose: jest.fn(),
        }),
        showQuickPick: jest.fn(),
        showInformationMessage: jest.fn(),
        showErrorMessage: jest.fn(),
        showWarningMessage: jest.fn(),
        setStatusBarMessage: jest.fn(),
        showOpenDialog: jest.fn(),
        tabGroups: {
            all: [],
        },
    },
    workspace: {
        asRelativePath: jest.fn(),
    },
    StatusBarAlignment: {
        Left: 1,
        Right: 2,
    },
    commands: {
        registerCommand: jest.fn().mockReturnValue({ dispose: jest.fn() }),
        executeCommand: jest.fn(),
    },
    ExtensionContext: jest.fn(),
    Memento: jest.fn(),
    Disposable: jest.fn(),
    TabInputText: jest.fn(),
    Uri: jest.fn(),
};

module.exports = vscode;
