import { Validation, getLastValidation, setLastValidation } from '../../src/cfn/Validation';
import { LanguageClient } from 'vscode-languageclient/node';
import * as Message from '../../src/ui/Message';
import * as StatusBar from '../../src/ui/StatusBar';
import * as StackActionAPIs from '../../src/cfn/StackActionAPIs';

jest.mock('../../src/ui/Message');
jest.mock('../../src/ui/StatusBar');
jest.mock('../../src/cfn/StackActionAPIs');

describe('Validation', () => {
    let mockClient: jest.Mocked<LanguageClient>;
    let validation: Validation;

    beforeEach(() => {
        mockClient = {
            sendRequest: jest.fn(),
        } as any;

        validation = new Validation('test.yaml', 'test-stack', mockClient, {} as any);
        jest.clearAllMocks();
    });

    afterEach(() => {
        jest.clearAllTimers();
    });

    describe('validate', () => {
        it('should show validation started and create status bar', async () => {
            const mockStatusBar = { show: jest.fn() } as any;
            jest.spyOn(StackActionAPIs, 'validateTemplate').mockResolvedValue({
                id: 'test-id',
                changeSetName: 'test-changeset',
                stackName: 'test-stack',
            });
            jest.spyOn(StatusBar, 'createDeploymentStatusBar').mockReturnValue(mockStatusBar);
            jest.spyOn(validation as any, 'pollForProgress').mockImplementation();

            await validation.validate();

            expect(Message.showValidationStarted).toHaveBeenCalledWith('test-stack');
            expect(StatusBar.createDeploymentStatusBar).toHaveBeenCalledWith();
            expect(StackActionAPIs.validateTemplate).toHaveBeenCalled();
        });

        it('should handle validation errors', async () => {
            const error = new Error('Validation failed');
            jest.spyOn(StackActionAPIs, 'validateTemplate').mockRejectedValue(error);

            await validation.validate();

            expect(Message.showErrorMessage).toHaveBeenCalledWith('Error validating template: Validation failed');
        });
    });

    describe('last validation tracking', () => {
        it('should get and set last validation', () => {
            expect(getLastValidation()).toBeNull();

            setLastValidation(validation);
            expect(getLastValidation()).toBe(validation);

            setLastValidation(null);
            expect(getLastValidation()).toBeNull();
        });
    });
});
