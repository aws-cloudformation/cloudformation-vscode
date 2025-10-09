import { Deployment } from '../../../src/stacks/actions/DeploymentWorkflow';
import { LanguageClient } from 'vscode-languageclient/node';
import { StackActionPhase, StackActionState } from '../../../src/stacks/actions/StackActionRequestType';
import * as Message from '../../../src/ui/Message';
import * as StatusBar from '../../../src/ui/StatusBar';
import * as StackActionApi from '../../../src/stacks/actions/StackActionApi';

jest.mock('../../../src/ui/Message');
jest.mock('../../../src/ui/StatusBar');
jest.mock('../../../src/stacks/actions/StackActionApi');

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
            jest.spyOn(StackActionApi, 'deploy').mockResolvedValue({
                id: 'test-id',
                changeSetName: 'test-changeset',
                stackName: 'test-stack',
            });
            jest.spyOn(StatusBar, 'createDeploymentStatusBar').mockReturnValue(mockStatusBar);
            jest.spyOn(deployment as any, 'pollForProgress').mockImplementation();

            await deployment.deploy();

            expect(Message.showDeploymentStarted).toHaveBeenCalledWith('test-stack');
            expect(StatusBar.createDeploymentStatusBar).toHaveBeenCalledWith();
            expect(StackActionApi.deploy).toHaveBeenCalled();
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
                state: StackActionState.SUCCESSFUL,
            };
            jest.spyOn(StackActionApi, 'getDeploymentStatus').mockResolvedValue(mockResult);

            await deployment.deploy();
            jest.advanceTimersByTime(1000);
            await Promise.resolve();

            expect(Message.showDeploymentSuccess).toHaveBeenCalledWith('test-stack');
        });

        it('should handle failed deployment', async () => {
            const mockResult = {
                id: 'test-id',
                phase: StackActionPhase.DEPLOYMENT_FAILED,
                state: StackActionState.FAILED,
            };
            jest.spyOn(StackActionApi, 'getDeploymentStatus').mockResolvedValue(mockResult);

            await deployment.deploy();
            jest.advanceTimersByTime(1000);
            await Promise.resolve();

            expect(Message.showDeploymentFailure).toHaveBeenCalledWith('test-stack');
        });
    });
});
