import { Validation } from '../../src/cfn/Validation';
import { commands } from 'vscode';
import { DiffWebviewProvider } from '../../src/ui/DiffWebviewProvider';
import { StackChange } from '../../src/cfn/StackActionRequestType';

jest.mock('vscode', () => ({
    commands: {
        executeCommand: jest.fn(),
    },
    window: {
        showErrorMessage: jest.fn(),
        showInformationMessage: jest.fn(),
        showWarningMessage: jest.fn(),
    },
}));

// Test-specific subclass to access protected methods
class TestableValidation extends Validation {
    public testGetDiffProvider(): DiffWebviewProvider {
        return this.getDiffProvider();
    }

    public testSetChanges(changes: StackChange[]): void {
        this.setChanges(changes);
    }

    public testShowDiffView(): void {
        this.showDiffViewForTest();
    }
}

describe('Validation Enhanced Features', () => {
    let validation: TestableValidation;
    let mockClient: any;
    let mockDiffProvider: any;

    beforeEach(() => {
        mockClient = {
            sendRequest: jest.fn(),
        };

        mockDiffProvider = {
            updateData: jest.fn(),
        };

        validation = new TestableValidation('test.yaml', 'test-stack', mockClient, mockDiffProvider);
        jest.clearAllMocks();
    });

    test('should accept diffProvider in constructor', () => {
        expect(validation.testGetDiffProvider()).toBe(mockDiffProvider);
    });

    test('should show diff view on successful validation', () => {
        const changes = [
            {
                resourceChange: {
                    action: 'Add',
                    logicalResourceId: 'TestBucket',
                },
            },
        ];

        // Set changes and call showDiffView using test methods
        validation.testSetChanges(changes);
        validation.testShowDiffView();

        expect(commands.executeCommand).toHaveBeenCalledWith('setContext', 'cloudformationDiffVisible', true);
        expect(mockDiffProvider.updateData).toHaveBeenCalledWith('test-stack', changes);
        expect(commands.executeCommand).toHaveBeenCalledWith('aws.cloudformation.diff.focus');
    });

    test('should not show diff view on failed validation', async () => {
        // Simulate a failed validation
        mockClient.sendRequest.mockRejectedValueOnce(new Error('Validation failed'));

        // Call the validate method
        await validation.validate();

        // Verify diff view is not shown
        expect(mockDiffProvider.updateData).not.toHaveBeenCalled();
    });
});
