import { rerunLastValidationCommand, extractToParameterPositionCursorCommand } from '../../src/commands/CfnCommands';
import { getLastValidation } from '../../src/cfn/Validation';
import * as vscode from 'vscode';
import { showErrorMessage } from '../../src/ui/Message';

jest.mock('../../src/cfn/Validation');
jest.mock('../../src/ui/Message');
jest.mock('vscode');

describe('CfnCommands', () => {
    let mockValidation: any;

    beforeEach(() => {
        mockValidation = {
            validate: jest.fn(),
            uri: 'test.yaml',
            stackName: 'test-stack',
        };
        jest.clearAllMocks();
    });

    describe('rerunLastValidationCommand', () => {
        it('should rerun last validation when available', async () => {
            (getLastValidation as jest.Mock).mockReturnValue(mockValidation);
            const mockCommand = jest.fn();
            (vscode.commands.registerCommand as jest.Mock).mockImplementation((_, handler) => {
                mockCommand.mockImplementation(handler);
                return { dispose: jest.fn() };
            });

            const disposable = rerunLastValidationCommand();
            await mockCommand();

            expect(mockValidation.validate).toHaveBeenCalled();
            expect(disposable).toBeDefined();
        });

        it('should show error when no validation available', async () => {
            (getLastValidation as jest.Mock).mockReturnValue(null);
            const mockCommand = jest.fn();
            (vscode.commands.registerCommand as jest.Mock).mockImplementation((_, handler) => {
                mockCommand.mockImplementation(handler);
                return { dispose: jest.fn() };
            });

            rerunLastValidationCommand();
            await mockCommand();

            expect(showErrorMessage).toHaveBeenCalledWith('No previous validation to rerun');
        });
    });

    describe('extractToParameterPositionCursorCommand', () => {
        it('should register the command', () => {
            (vscode.commands.registerCommand as jest.Mock).mockImplementation((commandName, handler) => {
                expect(commandName).toBe('aws.cloudformation.extractToParameter.positionCursor');
                expect(typeof handler).toBe('function');
                return { dispose: jest.fn() };
            });

            const disposable = extractToParameterPositionCursorCommand();
            expect(disposable).toBeDefined();
        });
    });
});
