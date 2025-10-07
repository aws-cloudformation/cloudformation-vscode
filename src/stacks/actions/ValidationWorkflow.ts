import { v4 as uuidv4 } from 'uuid';
import { Parameter, Capability } from '@aws-sdk/client-cloudformation';
import { StackActionPhase, StackChange, StackActionState } from './StackActionRequestType';
import { LanguageClient } from 'vscode-languageclient/node';
import {
    showErrorMessage,
    showValidationStarted,
    showValidationSuccess,
    showValidationFailure,
} from '../../ui/Message';
import { getValidationStatus, validate } from './StackActionApi';
import { createDeploymentStatusBar, updateDeploymentStatus } from '../../ui/StatusBar';
import { StatusBarItem, commands } from 'vscode';
import { DiffWebviewProvider } from '../../ui/DiffWebviewProvider';
import { createStackActionParams } from './StackActionUtil';

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
    private status: StackActionPhase | undefined;
    private changes: StackChange[] | undefined;
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
            await validate(
                this.client,
                createStackActionParams(this.id, this.uri, this.stackName, this.parameters, this.capabilities),
            );
            this.pollForProgress();
        } catch (error) {
            showErrorMessage(`Error validating template: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    getChanges(): StackChange[] | undefined {
        return this.changes;
    }

    private pollForProgress() {
        const interval = setInterval(() => {
            getValidationStatus(this.client, { id: this.id })
                .then((validationResult) => {
                    if (validationResult.phase === this.status) {
                        return;
                    }

                    this.status = validationResult.phase;
                    this.changes = validationResult.changes;

                    if (this.statusBarItem) {
                        updateDeploymentStatus(this.statusBarItem, validationResult.phase);
                    }

                    switch (validationResult.phase) {
                        case StackActionPhase.VALIDATION_IN_PROGRESS:
                            // Status bar updated above
                            break;
                        case StackActionPhase.VALIDATION_COMPLETE:
                            if (validationResult.state === StackActionState.SUCCESSFUL) {
                                showValidationSuccess(this.stackName);

                                this.showDiffView();
                            } else {
                                showValidationFailure(this.stackName);
                            }
                            clearInterval(interval);
                            break;
                        case StackActionPhase.VALIDATION_FAILED:
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

    protected setChanges(changes: StackChange[]): void {
        this.changes = changes;
    }

    protected showDiffViewForTest(): void {
        this.showDiffView();
    }
}
