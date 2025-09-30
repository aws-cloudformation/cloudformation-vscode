import { commands, Disposable } from 'vscode';
import { StackStatus, StackSummary } from '@aws-sdk/client-cloudformation';
import { RequestType } from 'vscode-languageserver-protocol';
import { LanguageClient } from 'vscode-languageclient/node';
import { commandKey } from '../utils';

type ListStacksParams = {
    statusToInclude?: StackStatus[];
    statusToExclude?: StackStatus[];
};

type ListStacksResult = {
    stacks: StackSummary[];
};

const ListStacksRequest = new RequestType<ListStacksParams, ListStacksResult, void>('aws/cfn/stacks');
const PollIntervalMs = 1000;

type StacksChangeListener = (stacks: StackSummary[]) => void;

export class StacksManager implements Disposable {
    private stacks: StackSummary[] = [];
    private readonly listeners: StacksChangeListener[] = [];
    private poller?: NodeJS.Timeout;

    constructor(private readonly client: LanguageClient) {}

    addListener(listener: StacksChangeListener) {
        this.listeners.push(listener);
    }

    get() {
        return [...this.stacks];
    }

    reload() {
        void this.loadStacks();
    }

    startPolling() {
        this.poller ??= setInterval(() => {
            this.reload();
        }, PollIntervalMs);
    }

    stopPolling() {
        if (this.poller) {
            clearInterval(this.poller);
            this.poller = undefined;
        }
    }

    dispose() {
        this.stopPolling();
    }

    private async loadStacks() {
        try {
            const response = await this.client.sendRequest(ListStacksRequest, {
                statusToExclude: ['DELETE_COMPLETE'],
            });
            this.stacks = response.stacks;
        } catch (error) {
            this.stacks = [];
        } finally {
            this.listeners.forEach((listener) => {
                listener(this.stacks);
            });
            if (this.stacks.length === 0) {
                this.stopPolling();
            }
        }
    }
}

export function refreshCommand(manager: StacksManager) {
    return commands.registerCommand(commandKey('stacks.refresh'), () => {
        manager.reload();
    });
}
