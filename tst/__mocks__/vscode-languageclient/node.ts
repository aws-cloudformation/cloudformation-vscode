// Mock implementation of the vscode-languageclient/node module
const vscodeLanguageClient = {
    LanguageClient: jest.fn().mockImplementation(() => ({
        start: jest.fn(),
        stop: jest.fn(),
        sendRequest: jest.fn().mockResolvedValue({}),
        onReady: jest.fn().mockResolvedValue(undefined),
    })),
};

module.exports = vscodeLanguageClient;
