import { v4 as uuidv4 } from 'uuid';
import { Parameter, Capability } from '@aws-sdk/client-cloudformation';
import { TemplateActionParams, TemplateStatus, WorkflowResult } from './TemplateRequestType';
import { LanguageClient } from 'vscode-languageclient/node';
import {
    showDeploymentStarted,
    showDeploymentSuccess,
    showDeploymentFailure,
    showValidationComplete,
} from '../ui/Message';
import { createStackActionStatusBar, updateDeploymentStatus } from '../ui/StatusBar';
import { StatusBarItem } from 'vscode';
import { deployTemplate, getTemplateDeploymentStatus } from './TemplateAPIs';

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
    private status: TemplateStatus | undefined;
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
        await deployTemplate(this.client, this.getTemplateWorkflowParams());
        showDeploymentStarted(this.stackName);
        this.statusBarItem = createStackActionStatusBar();
        this.pollForProgress();
    }

    private getTemplateWorkflowParams(): TemplateActionParams {
        return {
            id: this.id,
            uri: this.uri,
            stackName: this.stackName,
            parameters: this.parameters,
            capabilities: this.capabilities,
        };
    }

    private pollForProgress() {
        const interval = setInterval(() => {
            getTemplateDeploymentStatus(this.client, { id: this.id })
                .then((deploymentResult) => {
                    if (deploymentResult.status === this.status) {
                        return;
                    }

                    this.status = deploymentResult.status;
                    if (this.statusBarItem) {
                        updateDeploymentStatus(this.statusBarItem, deploymentResult.status);
                    }

                    switch (deploymentResult.status) {
                        case TemplateStatus.VALIDATION_COMPLETE:
                            if (deploymentResult.status === TemplateStatus.VALIDATION_COMPLETE) {
                                showValidationComplete(this.stackName);
                            }
                            // Status bar updated above, continue polling
                            break;
                        case TemplateStatus.DEPLOYMENT_COMPLETE:
                            if (deploymentResult.result === WorkflowResult.SUCCESSFUL) {
                                showDeploymentSuccess(this.stackName);
                            } else {
                                showDeploymentFailure(this.stackName);
                            }
                            clearInterval(interval);
                            break;
                        case TemplateStatus.DEPLOYMENT_FAILED:
                        case TemplateStatus.VALIDATION_FAILED:
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
