import { Deployment, setLastDeployment, getLastDeployment } from '../../src/cfn/Deployment';
import { LanguageClient } from 'vscode-languageclient/node';
import { TemplateStatus, WorkflowResult } from '../../src/cfn/TemplateRequestType';
import * as Message from '../../src/ui/Message';
import * as StatusBar from '../../src/ui/StatusBar';
import * as TemplateAPIs from '../../src/cfn/TemplateAPIs';

jest.mock('../../src/ui/Message');
jest.mock('../../src/ui/StatusBar');
jest.mock('../../src/cfn/TemplateAPIs');

describe('Deployment', () => {
    let mockClient: jest.Mocked<LanguageClient>;
    let deployment: Deployment;
    let mockStatusBar: any;

    beforeEach(() => {
        mockClient = {
            sendRequest: jest.fn(),
        } as any;

        mockStatusBar = { show: jest.fn(), dispose: jest.fn() };
        deployment = new Deployment('test.yaml', 'test-stack', mockClient);
        jest.clearAllMocks();
    });

    describe('deploy', () => {
        it('should show deployment started and create status bar', async () => {
            jest.spyOn(TemplateAPIs, 'deployTemplate').mockResolvedValue({
                id: 'test-id',
                changeSetName: 'test-changeset',
                stackName: 'test-stack',
            });
            jest.spyOn(StatusBar, 'createDeploymentStatusBar').mockReturnValue(mockStatusBar);
            jest.spyOn(deployment as any, 'pollForProgress').mockImplementation();

            await deployment.deploy();

            expect(Message.showDeploymentStarted).toHaveBeenCalledWith('test-stack');
            expect(StatusBar.createDeploymentStatusBar).toHaveBeenCalledWith();
            expect(TemplateAPIs.deployTemplate).toHaveBeenCalled();
        });
    });

    describe('polling', () => {
        beforeEach(() => {
            jest.useFakeTimers();
            jest.spyOn(StatusBar, 'createDeploymentStatusBar').mockReturnValue(mockStatusBar);
        });

        afterEach(() => {
            jest.useRealTimers();
            jest.clearAllTimers();
        });

        it('should handle successful deployment completion', async () => {
            const mockResult = {
                id: 'test-id',
                status: TemplateStatus.DEPLOYMENT_COMPLETE,
                result: WorkflowResult.SUCCESSFUL,
            };
            jest.spyOn(TemplateAPIs, 'getTemplateDeploymentStatus').mockResolvedValue(mockResult);
            setLastDeployment(deployment);

            await deployment.deploy();
            jest.advanceTimersByTime(1000);
            await Promise.resolve();

            expect(Message.showDeploymentSuccess).toHaveBeenCalledWith('test-stack');
            expect(mockStatusBar.dispose).toHaveBeenCalled();
            expect(getLastDeployment()).toBeNull();
        });

        it('should handle failed deployment', async () => {
            const mockResult = {
                id: 'test-id',
                status: TemplateStatus.DEPLOYMENT_FAILED,
                result: WorkflowResult.FAILED,
            };
            jest.spyOn(TemplateAPIs, 'getTemplateDeploymentStatus').mockResolvedValue(mockResult);
            setLastDeployment(deployment);

            await deployment.deploy();
            jest.advanceTimersByTime(1000);
            await Promise.resolve();

            expect(Message.showDeploymentFailure).toHaveBeenCalledWith('test-stack');
            expect(mockStatusBar.dispose).toHaveBeenCalled();
            expect(getLastDeployment()).toBeNull();
        });

        it('should cleanup resources on validation failed', async () => {
            const mockResult = {
                id: 'test-id',
                status: TemplateStatus.VALIDATION_FAILED,
                result: WorkflowResult.FAILED,
            };
            jest.spyOn(TemplateAPIs, 'getTemplateDeploymentStatus').mockResolvedValue(mockResult);
            setLastDeployment(deployment);

            await deployment.deploy();
            jest.advanceTimersByTime(1000);
            await Promise.resolve();

            expect(Message.showDeploymentFailure).toHaveBeenCalledWith('test-stack');
            expect(mockStatusBar.dispose).toHaveBeenCalled();
            expect(getLastDeployment()).toBeNull();
        });
    });
});
