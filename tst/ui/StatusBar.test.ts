import * as vscode from 'vscode';
import { createDeploymentStatusBar, updateDeploymentStatus } from '../../src/ui/StatusBar';
import { TemplateStatus } from '../../src/cfn/TemplateRequestType';

jest.mock('vscode', () => ({
    window: {
        createStatusBarItem: jest.fn(),
    },
    StatusBarAlignment: {
        Left: 1,
    },
    ThemeColor: jest.fn().mockImplementation((color) => ({ color })),
}));

describe('StatusBar', () => {
    let mockStatusBarItem: jest.Mocked<vscode.StatusBarItem>;

    beforeEach(() => {
        mockStatusBarItem = {
            text: '',
            tooltip: '',
            backgroundColor: undefined,
            show: jest.fn(),
            hide: jest.fn(),
            dispose: jest.fn(),
        } as any;

        (vscode.window.createStatusBarItem as jest.Mock).mockReturnValue(mockStatusBarItem);
        jest.clearAllMocks();
    });

    describe('createDeploymentStatusBar', () => {
        it('should create status bar with initial text', () => {
            const result = createDeploymentStatusBar();

            expect(vscode.window.createStatusBarItem).toHaveBeenCalledWith(vscode.StatusBarAlignment.Left, 100);
            expect(mockStatusBarItem.text).toBe('$(sync~spin) Validation Starting...');
            expect(mockStatusBarItem.show).toHaveBeenCalled();
            expect(result).toBe(mockStatusBarItem);
        });
    });

    describe('updateDeploymentStatus', () => {
        it('should update status for validation in progress', () => {
            updateDeploymentStatus(mockStatusBarItem, TemplateStatus.VALIDATION_IN_PROGRESS);

            expect(mockStatusBarItem.text).toBe('$(sync~spin) Validating Template...');
        });

        it('should update status for deployment in progress', () => {
            updateDeploymentStatus(mockStatusBarItem, TemplateStatus.DEPLOYMENT_IN_PROGRESS);

            expect(mockStatusBarItem.text).toBe('$(sync~spin) Deploying Stack...');
        });

        it('should update status for completion', () => {
            updateDeploymentStatus(mockStatusBarItem, TemplateStatus.DEPLOYMENT_COMPLETE);

            expect(mockStatusBarItem.text).toBe('$(check) Deployment Complete');
        });

        it('should update status for failure with error color', () => {
            updateDeploymentStatus(mockStatusBarItem, TemplateStatus.DEPLOYMENT_FAILED);

            expect(mockStatusBarItem.text).toBe('$(error) Deployment Failed');
            expect(mockStatusBarItem.backgroundColor).toBeDefined();
        });
    });
});
