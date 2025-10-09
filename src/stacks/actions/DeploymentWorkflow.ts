import { v4 as uuidv4 } from 'uuid';
import { Parameter, Capability } from '@aws-sdk/client-cloudformation';
import { StackActionPhase, StackActionState } from './StackActionRequestType';
import { LanguageClient } from 'vscode-languageclient/node';
import {
    showDeploymentStarted,
    showDeploymentSuccess,
    showDeploymentFailure,
    showValidationComplete,
} from '../../ui/Message';
import { createDeploymentStatusBar, updateDeploymentStatus } from '../../ui/StatusBar';
import { StatusBarItem } from 'vscode';
import { deploy, getDeploymentStatus } from './StackActionApi';
import { createStackActionParams } from './StackActionUtil';

let lastDeployment: Deployment | null = null;

export function getLastDeployment(): Deployment | null {
    return lastDeployment;
}

export function setLastDeployment(deployment: Deployment | null): void {
    lastDeployment = deployment;
}

export class Deployment {
    private readonly id: string;
    private readonly uri: string;
    private readonly stackName: string;
    private readonly parameters?: Parameter[];
    private readonly capabilities?: Capability[];
    private readonly client: LanguageClient;
    private status: StackActionPhase | undefined;
    private statusBarItem?: StatusBarItem;

    constructor(
        uri: string,
        stackName: string,
        client: LanguageClient,
        parameters?: Parameter[],
        capabilities?: Capability[],
    ) {
        this.id = uuidv4();
        this.uri = uri;
        this.stackName = stackName;
        this.client = client;
        this.parameters = parameters;
        this.capabilities = capabilities;
    }

    async deploy() {
        await deploy(
            this.client,
            createStackActionParams(this.id, this.uri, this.stackName, this.parameters, this.capabilities),
        );
        showDeploymentStarted(this.stackName);
        this.statusBarItem = createDeploymentStatusBar();
        this.pollForProgress();
    }

    private pollForProgress() {
        const interval = setInterval(() => {
            getDeploymentStatus(this.client, { id: this.id })
                .then((deploymentResult) => {
                    if (deploymentResult.phase === this.status) {
                        return;
                    }

                    this.status = deploymentResult.phase;
                    if (this.statusBarItem) {
                        updateDeploymentStatus(this.statusBarItem, deploymentResult.phase);
                    }

                    switch (deploymentResult.phase) {
                        case StackActionPhase.VALIDATION_COMPLETE:
                            if (deploymentResult.phase === StackActionPhase.VALIDATION_COMPLETE) {
                                showValidationComplete(this.stackName);
                            }
                            // Status bar updated above, continue polling
                            break;
                        case StackActionPhase.DEPLOYMENT_COMPLETE:
                            if (deploymentResult.state === StackActionState.SUCCESSFUL) {
                                showDeploymentSuccess(this.stackName);
                            } else {
                                showDeploymentFailure(this.stackName);
                            }
                            clearInterval(interval);
                            break;
                        case StackActionPhase.DEPLOYMENT_FAILED:
                        case StackActionPhase.VALIDATION_FAILED:
                            showDeploymentFailure(this.stackName);
                            clearInterval(interval);
                            break;
                    }
                })
                .catch((error) => {
                    console.error('Error polling for deployment status:', error);
                    showDeploymentFailure(this.stackName);
                    clearInterval(interval);
                });
        }, 1000);
    }
}
