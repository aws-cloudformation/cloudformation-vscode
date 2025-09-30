// Mock implementation of the vscode-languageclient module
const vscodeLanguageClientMain = {
    ExecuteCommandRequest: {
        method: 'workspace/executeCommand',
        type: {
            get: jest.fn(),
        },
    },
};

module.exports = vscodeLanguageClientMain;
