import { Deployment } from '../../src/cfn/Deployment';
import { LanguageClient } from 'vscode-languageclient/node';
import { StackActionPhase, StackActionStatus } from '../../src/cfn/StackActionRequestType';
import * as Message from '../../src/ui/Message';
import * as StatusBar from '../../src/ui/StatusBar';
import * as StackActionAPIs from '../../src/cfn/StackActionAPIs';

jest.mock('../../src/ui/Message');
jest.mock('../../src/ui/StatusBar');
jest.mock('../../src/cfn/StackActionAPIs');

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
            jest.spyOn(StackActionAPIs, 'deployTemplate').mockResolvedValue({
                id: 'test-id',
                changeSetName: 'test-changeset',
                stackName: 'test-stack',
            });
            jest.spyOn(StatusBar, 'createDeploymentStatusBar').mockReturnValue(mockStatusBar);
            jest.spyOn(deployment as any, 'pollForProgress').mockImplementation();

            await deployment.deploy();

            expect(Message.showDeploymentStarted).toHaveBeenCalledWith('test-stack');
            expect(StatusBar.createDeploymentStatusBar).toHaveBeenCalledWith();
            expect(StackActionAPIs.deployTemplate).toHaveBeenCalled();
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
                phase: StackActionPhase.DEPLOYMENT_COMPLETE,
                status: StackActionStatus.SUCCESSFUL,
            };
            jest.spyOn(StackActionAPIs, 'getTemplateDeploymentStatus').mockResolvedValue(mockResult);

            await deployment.deploy();
            jest.advanceTimersByTime(1000);
            await Promise.resolve();

            expect(Message.showDeploymentSuccess).toHaveBeenCalledWith('test-stack');
        });

        it('should handle failed deployment', async () => {
            const mockResult = {
                id: 'test-id',
                phase: StackActionPhase.DEPLOYMENT_FAILED,
                status: StackActionStatus.FAILED,
            };
            jest.spyOn(StackActionAPIs, 'getTemplateDeploymentStatus').mockResolvedValue(mockResult);

            await deployment.deploy();
            jest.advanceTimersByTime(1000);
            await Promise.resolve();

            expect(Message.showDeploymentFailure).toHaveBeenCalledWith('test-stack');
        });
    });
});
