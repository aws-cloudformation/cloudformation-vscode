import { v4 as uuidv4 } from 'uuid';
import { Parameter, Capability } from '@aws-sdk/client-cloudformation';
import { TemplateStatus, TemplateChange, TemplateActionParams, WorkflowResult } from './TemplateRequestType';
import { LanguageClient } from 'vscode-languageclient/node';
import { showErrorMessage, showValidationStarted, showValidationSuccess, showValidationFailure } from '../ui/Message';
import { getTemplateValidationStatus, validateTemplate } from './TemplateAPIs';
import { createDeploymentStatusBar, updateDeploymentStatus } from '../ui/StatusBar';
import { StatusBarItem, commands } from 'vscode';
import { DiffWebviewProvider } from '../ui/DiffWebviewProvider';

// TODO move this to server side, we should let server handle last validation
let lastValidation: Validation | null = null;

export function getLastValidation(): Validation | null {
    return lastValidation;
}

export function setLastValidation(validation: Validation | null): void {
    lastValidation = validation;
}

export class Validation {
    private id: string;
    public readonly uri: string;
    public readonly stackName: string;
    public readonly parameters?: Parameter[];
    private capabilities?: Capability[];
    private client: LanguageClient;
    private diffProvider: DiffWebviewProvider;
    private status: TemplateStatus | undefined;
    private changes: TemplateChange[] | undefined;
    private statusBarItem: StatusBarItem | undefined;

    constructor(
        uri: string,
        stackName: string,
        client: LanguageClient,
        diffProvider: DiffWebviewProvider,
        parameters?: Parameter[],
        capabilities?: Capability[],
    ) {
        this.id = uuidv4();
        this.uri = uri;
        this.stackName = stackName;
        this.client = client;
        this.diffProvider = diffProvider;
        this.parameters = parameters;
        this.capabilities = capabilities;
    }

    async validate() {
        try {
            showValidationStarted(this.stackName);
            this.statusBarItem = createDeploymentStatusBar();
            await validateTemplate(this.client, this.getTemplateWorkflowParams());
            this.pollForProgress();
        } catch (error) {
            showErrorMessage(`Error validating template: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    getChanges(): TemplateChange[] | undefined {
        return this.changes;
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
            getTemplateValidationStatus(this.client, { id: this.id })
                .then((validationResult) => {
                    if (validationResult.status === this.status) {
                        return;
                    }

                    this.status = validationResult.status;
                    this.changes = validationResult.changes;

                    if (this.statusBarItem) {
                        updateDeploymentStatus(this.statusBarItem, validationResult.status);
                    }

                    switch (validationResult.status) {
                        case TemplateStatus.VALIDATION_IN_PROGRESS:
                            // Status bar updated above
                            break;
                        case TemplateStatus.VALIDATION_COMPLETE:
                            if (validationResult.result === WorkflowResult.SUCCESSFUL) {
                                showValidationSuccess(this.stackName);

                                this.showDiffView();
                            } else {
                                showValidationFailure(this.stackName);
                            }
                            clearInterval(interval);
                            break;
                        case TemplateStatus.VALIDATION_FAILED:
                            showValidationFailure(this.stackName);
                            clearInterval(interval);
                            break;
                    }
                })
                .catch((error) => {
                    showErrorMessage(
                        `Error polling for validation status: ${error instanceof Error ? error.message : String(error)}`,
                    );
                    clearInterval(interval);
                });
        }, 1000);
    }

    private showDiffView() {
        commands.executeCommand('setContext', 'cloudformationDiffVisible', true);
        this.diffProvider.updateData(this.stackName, this.changes);
        commands.executeCommand('aws.cloudformation.diff.focus');
    }

    // Test-specific accessors - protected to limit access
    protected getDiffProvider(): DiffWebviewProvider {
        return this.diffProvider;
    }

    protected setChanges(changes: TemplateChange[]): void {
        this.changes = changes;
    }

    protected showDiffViewForTest(): void {
        this.showDiffView();
    }
}
