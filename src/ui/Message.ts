import { window } from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
import { getTemplateDeploymentStatus } from '../cfn/TemplateAPIs';
import { TemplateStatus, WorkflowResult } from '../cfn/TemplateRequestType';

export async function showDeploymentCompletion(
    client: LanguageClient,
    deploymentId: string,
    stackName: string,
): Promise<void> {
    try {
        const pollResult = await getTemplateDeploymentStatus(client, { id: deploymentId });

        if (
            pollResult.status === TemplateStatus.DEPLOYMENT_COMPLETE &&
            pollResult.result === WorkflowResult.SUCCESSFUL
        ) {
            window.showInformationMessage(`Deployment completed successfully for stack: ${stackName}`);
        } else if (
            pollResult.status === TemplateStatus.DEPLOYMENT_FAILED ||
            pollResult.status === TemplateStatus.VALIDATION_FAILED ||
            pollResult.result === WorkflowResult.FAILED
        ) {
            window.showErrorMessage(`Deployment failed for stack: ${stackName}`);
        } else {
            window.showWarningMessage(`Deployment status unknown for stack: ${stackName}`);
        }
    } catch (error) {
        window.showErrorMessage(`Error checking deployment status for stack: ${stackName}`);
    }
}

export function showDeploymentSuccess(stackName: string) {
    window.showInformationMessage(`Deployment completed successfully for stack: ${stackName}`);
}

export function showDeploymentFailure(stackName: string) {
    window.showErrorMessage(`Deployment failed for stack: ${stackName}`);
}

export function showValidationComplete(stackName: string) {
    window.showInformationMessage(`Validation completed for stack: ${stackName}. Starting deployment...`);
}

export function showValidationStarted(stackName: string) {
    window.showInformationMessage(`Validation started for stack: ${stackName}`);
}

export function showValidationSuccess(stackName: string) {
    window.showInformationMessage(`Validation completed successfully for stack: ${stackName}`);
}

export function showValidationFailure(stackName: string) {
    window.showErrorMessage(`Validation failed for stack: ${stackName}`);
}

export function showDeploymentStarted(stackName: string) {
    window.showInformationMessage(`Deployment started for stack: ${stackName}`);
}

export function showErrorMessage(message: string) {
    window.showErrorMessage(message);
}
