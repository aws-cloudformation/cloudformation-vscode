import * as vscode from 'vscode';
import {
    showValidationStarted,
    showValidationSuccess,
    showValidationFailure,
    showDeploymentStarted,
    showDeploymentSuccess,
    showDeploymentFailure,
    showValidationComplete,
    showErrorMessage,
} from '../../src/ui/Message';

jest.mock('vscode');

describe('Message', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should show validation started message', () => {
        showValidationStarted('test-stack');
        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('Validation started for stack: test-stack');
    });

    it('should show validation success message', () => {
        showValidationSuccess('test-stack');
        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
            'Validation completed successfully for stack: test-stack',
        );
    });

    it('should show validation failure message', () => {
        showValidationFailure('test-stack');
        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('Validation failed for stack: test-stack');
    });

    it('should show deployment started message', () => {
        showDeploymentStarted('test-stack');
        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('Deployment started for stack: test-stack');
    });

    it('should show deployment success message', () => {
        showDeploymentSuccess('test-stack');
        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
            'Deployment completed successfully for stack: test-stack',
        );
    });

    it('should show deployment failure message', () => {
        showDeploymentFailure('test-stack');
        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('Deployment failed for stack: test-stack');
    });

    it('should show validation complete message', () => {
        showValidationComplete('test-stack');
        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
            'Validation completed for stack: test-stack. Starting deployment...',
        );
    });

    it('should show error message', () => {
        showErrorMessage('Test error');
        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('Test error');
    });
});
