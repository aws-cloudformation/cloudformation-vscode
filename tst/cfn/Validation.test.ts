import { Validation, getLastValidation, setLastValidation } from '../../src/cfn/Validation';
import { LanguageClient } from 'vscode-languageclient/node';
import { TemplateStatus, WorkflowResult } from '../../src/cfn/TemplateRequestType';
import * as Message from '../../src/ui/Message';
import * as StatusBar from '../../src/ui/StatusBar';
import * as TemplateAPIs from '../../src/cfn/TemplateAPIs';

jest.mock('../../src/ui/Message');
jest.mock('../../src/ui/StatusBar');
jest.mock('../../src/cfn/TemplateAPIs');

describe('Validation', () => {
    let mockClient: jest.Mocked<LanguageClient>;
    let validation: Validation;
    let mockStatusBar: any;
    let mockDiffProvider: any;

    beforeEach(() => {
        mockClient = {
            sendRequest: jest.fn(),
        } as any;

        mockStatusBar = { show: jest.fn(), dispose: jest.fn() };
        mockDiffProvider = { updateData: jest.fn() };
        validation = new Validation('test.yaml', 'test-stack', mockClient, mockDiffProvider);
        jest.clearAllMocks();
    });

    afterEach(() => {
        jest.clearAllTimers();
    });

    describe('validate', () => {
        it('should show validation started and create status bar', async () => {
            jest.spyOn(TemplateAPIs, 'validateTemplate').mockResolvedValue({
                id: 'test-id',
                changeSetName: 'test-changeset',
                stackName: 'test-stack',
            });
            jest.spyOn(StatusBar, 'createDeploymentStatusBar').mockReturnValue(mockStatusBar);
            jest.spyOn(validation as any, 'pollForProgress').mockImplementation();

            await validation.validate();

            expect(Message.showValidationStarted).toHaveBeenCalledWith('test-stack');
            expect(StatusBar.createDeploymentStatusBar).toHaveBeenCalledWith();
            expect(TemplateAPIs.validateTemplate).toHaveBeenCalled();
        });

        it('should handle validation errors', async () => {
            const error = new Error('Validation failed');
            jest.spyOn(TemplateAPIs, 'validateTemplate').mockRejectedValue(error);

            await validation.validate();

            expect(Message.showErrorMessage).toHaveBeenCalledWith('Error validating template: Validation failed');
        });
    });

    describe('polling', () => {
        beforeEach(() => {
            jest.useFakeTimers();
            jest.spyOn(StatusBar, 'createDeploymentStatusBar').mockReturnValue(mockStatusBar);
            jest.spyOn(TemplateAPIs, 'validateTemplate').mockResolvedValue({
                id: 'test-id',
                changeSetName: 'test-changeset',
                stackName: 'test-stack',
            });
        });

        afterEach(() => {
            jest.useRealTimers();
            jest.clearAllTimers();
        });

        it('should handle successful validation completion', async () => {
            const mockResult = {
                id: 'test-id',
                status: TemplateStatus.VALIDATION_COMPLETE,
                result: WorkflowResult.SUCCESSFUL,
            };
            jest.spyOn(TemplateAPIs, 'getTemplateValidationStatus').mockResolvedValue(mockResult);
            setLastValidation(validation);

            await validation.validate();
            jest.advanceTimersByTime(1000);
            await Promise.resolve();

            expect(Message.showValidationSuccess).toHaveBeenCalledWith('test-stack');
            expect(mockStatusBar.dispose).toHaveBeenCalled();
            expect(getLastValidation()).toBeNull();
        });

        it('should handle failed validation', async () => {
            const mockResult = {
                id: 'test-id',
                status: TemplateStatus.VALIDATION_FAILED,
                result: WorkflowResult.FAILED,
            };
            jest.spyOn(TemplateAPIs, 'getTemplateValidationStatus').mockResolvedValue(mockResult);
            setLastValidation(validation);

            await validation.validate();
            jest.advanceTimersByTime(1000);
            await Promise.resolve();

            expect(Message.showValidationFailure).toHaveBeenCalledWith('test-stack');
            expect(mockStatusBar.dispose).toHaveBeenCalled();
            expect(getLastValidation()).toBeNull();
        });

        it('should cleanup resources on validation complete with failure result', async () => {
            const mockResult = {
                id: 'test-id',
                status: TemplateStatus.VALIDATION_COMPLETE,
                result: WorkflowResult.FAILED,
            };
            jest.spyOn(TemplateAPIs, 'getTemplateValidationStatus').mockResolvedValue(mockResult);
            setLastValidation(validation);

            await validation.validate();
            jest.advanceTimersByTime(1000);
            await Promise.resolve();

            expect(Message.showValidationFailure).toHaveBeenCalledWith('test-stack');
            expect(mockStatusBar.dispose).toHaveBeenCalled();
            expect(getLastValidation()).toBeNull();
        });
    });

    describe('last validation tracking', () => {
        it('should get and set last validation', () => {
            setLastValidation(null); // Reset state
            expect(getLastValidation()).toBeNull();

            setLastValidation(validation);
            expect(getLastValidation()).toBe(validation);

            setLastValidation(null);
            expect(getLastValidation()).toBeNull();
        });
    });
});
