import { vi, describe, beforeEach, it, expect } from 'vitest';
import { window, ExtensionContext, StatusBarItem } from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
import { AwsCredentialsService } from '../../src/auth/AwsCredentials';
import { LoggerFactory } from '../../src/utils/Logger';

vi.mock('vscode');
vi.mock('vscode-languageclient/node');
vi.mock('vscode-languageclient');

const SuffixedUpdateRegionCommand = '/command/region/update.cloudformation-vscode';

describe('AwsCredentialsService', () => {
    let service: AwsCredentialsService;
    let mockContext: ExtensionContext;
    let mockStatusBarItem: StatusBarItem;
    let mockLanguageClient: LanguageClient;
    let mockGlobalState: { get: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };

    beforeEach(() => {
        vi.clearAllMocks();

        LoggerFactory.reset();
        LoggerFactory.initialize(window.createOutputChannel('test'));

        mockStatusBarItem = {
            show: vi.fn(),
            hide: vi.fn(),
            dispose: vi.fn(),
            text: '',
            tooltip: '',
            command: '',
        } as any;

        mockGlobalState = {
            get: vi.fn(),
            update: vi.fn(),
        };

        mockContext = {
            globalState: mockGlobalState,
        } as any;

        mockLanguageClient = {
            sendRequest: vi.fn().mockResolvedValue(undefined),
            initializeResult: {
                capabilities: { executeCommandProvider: { commands: [SuffixedUpdateRegionCommand] } },
            },
        } as any;

        (window.createStatusBarItem as ReturnType<typeof vi.fn>).mockReturnValue(mockStatusBarItem);
        (window.showQuickPick as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
        (window.showErrorMessage as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
        (window.setStatusBarMessage as ReturnType<typeof vi.fn>).mockReturnValue(undefined);

        service = new AwsCredentialsService(mockContext);
    });

    describe('constructor', () => {
        it('should initialize status bar item', () => {
            expect(window.createStatusBarItem).toHaveBeenCalled();
            expect(mockStatusBarItem.tooltip).toBe('Configure AWS region');
        });
    });

    describe('initialize', () => {
        it('should initialize with language client and show status bar', async () => {
            await service.initialize(mockLanguageClient);
            expect(mockStatusBarItem.show).toHaveBeenCalled();
        });

        it('should send region update to language client', async () => {
            mockGlobalState.get.mockReturnValue('us-west-2');
            const svc = new AwsCredentialsService(mockContext);
            await svc.initialize(mockLanguageClient);

            expect(mockLanguageClient.sendRequest).toHaveBeenCalledWith('workspace/executeCommand', {
                command: SuffixedUpdateRegionCommand,
                arguments: ['us-west-2'],
            });
        });

        it('should default to us-east-1 when no region saved', async () => {
            mockGlobalState.get.mockReturnValue(undefined);
            const svc = new AwsCredentialsService(mockContext);
            await svc.initialize(mockLanguageClient);

            expect(mockLanguageClient.sendRequest).toHaveBeenCalledWith('workspace/executeCommand', {
                command: SuffixedUpdateRegionCommand,
                arguments: ['us-east-1'],
            });
        });

        it('should update status bar text with region', async () => {
            mockGlobalState.get.mockReturnValue('eu-west-1');
            const svc = new AwsCredentialsService(mockContext);
            await svc.initialize(mockLanguageClient);

            expect(mockStatusBarItem.text).toBe('AWS Region: eu-west-1');
        });
    });

    describe('promptForRegionSelection', () => {
        beforeEach(async () => {
            await service.initialize(mockLanguageClient);
        });

        it('should show region picker', async () => {
            await service.promptForRegionSelection();

            expect(window.showQuickPick).toHaveBeenCalledWith(expect.arrayContaining(['us-east-1', 'us-west-2']), {
                placeHolder: 'Select an AWS region',
                canPickMany: false,
            });
        });

        it('should update region when selection is made', async () => {
            (window.showQuickPick as ReturnType<typeof vi.fn>).mockResolvedValue('ap-southeast-1');

            await service.promptForRegionSelection();

            expect(mockLanguageClient.sendRequest).toHaveBeenCalledWith('workspace/executeCommand', {
                command: SuffixedUpdateRegionCommand,
                arguments: ['ap-southeast-1'],
            });
            expect(mockStatusBarItem.text).toBe('AWS Region: ap-southeast-1');
        });

        it('should not update when no selection is made', async () => {
            (window.showQuickPick as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
            vi.clearAllMocks();

            await service.promptForRegionSelection();

            expect(mockLanguageClient.sendRequest).not.toHaveBeenCalled();
        });
    });

    describe('error handling', () => {
        beforeEach(async () => {
            await service.initialize(mockLanguageClient);
        });

        it('should show error message when region update fails', async () => {
            (mockLanguageClient.sendRequest as ReturnType<typeof vi.fn>).mockRejectedValue(
                new Error('Connection failed'),
            );
            (window.showQuickPick as ReturnType<typeof vi.fn>).mockResolvedValue('eu-central-1');

            await service.promptForRegionSelection();

            expect(window.showErrorMessage).toHaveBeenCalledWith(
                expect.stringContaining('Failed to update AWS region'),
            );
        });
    });

    describe('dispose', () => {
        it('should dispose status bar item', () => {
            service.dispose();
            expect(mockStatusBarItem.dispose).toHaveBeenCalled();
        });
    });
});
