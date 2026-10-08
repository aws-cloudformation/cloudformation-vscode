import { randomUUID } from 'crypto';
import { CodeAction, Command, commands, Disposable } from 'vscode';
import { ExecuteCommandRequest } from 'vscode-languageclient';
import {
    ClientCapabilities,
    DynamicFeature,
    ExecuteCommandRegistrationOptions,
    FeatureState,
    LanguageClient,
    RegistrationData,
    ServerCapabilities,
} from 'vscode-languageclient/node';
import { suffixedCommand } from './LspCommands';

type CommandClient = Pick<LanguageClient, 'sendRequest' | 'handleFailedRequest'>;

/**
 * Replaces the client library's execute-command feature. The server's command ids are registered with VS Code under
 * this client's suffix even when the server predates `aws.commandSuffix` and advertises unsuffixed ids, so another
 * extension hosting the same server in the window cannot collide with ours. Executions are forwarded to the server
 * under the id it advertised.
 */
export class SuffixedExecuteCommandFeature implements DynamicFeature<ExecuteCommandRegistrationOptions> {
    private readonly registrations = new Map<string, Disposable[]>();

    constructor(private readonly client: CommandClient) {}

    get registrationType() {
        return ExecuteCommandRequest.type;
    }

    getState(): FeatureState {
        return { kind: 'workspace', id: ExecuteCommandRequest.method, registrations: this.registrations.size > 0 };
    }

    fillClientCapabilities(capabilities: ClientCapabilities): void {
        (capabilities.workspace ??= {}).executeCommand = { dynamicRegistration: true };
    }

    initialize(capabilities: ServerCapabilities): void {
        if (capabilities.executeCommandProvider) {
            this.register({ id: randomUUID(), registerOptions: capabilities.executeCommandProvider });
        }
    }

    register(data: RegistrationData<ExecuteCommandRegistrationOptions>): void {
        this.registrations.set(
            data.id,
            data.registerOptions.commands.map((command) =>
                commands.registerCommand(
                    suffixedCommand(command),
                    async (...args: unknown[]) => await this.execute(command, args),
                ),
            ),
        );
    }

    unregister(id: string): void {
        for (const registration of this.registrations.get(id) ?? []) {
            registration.dispose();
        }
        this.registrations.delete(id);
    }

    clear(): void {
        for (const id of this.registrations.keys()) {
            this.unregister(id);
        }
    }

    private async execute(command: string, args: unknown[]): Promise<unknown> {
        try {
            return await this.client.sendRequest<unknown>(ExecuteCommandRequest.method, { command, arguments: args });
        } catch (error) {
            // `defaultValue` is a required parameter: the client returns it for errors it swallows and rethrows the rest.
            // eslint-disable-next-line unicorn/no-useless-undefined
            return this.client.handleFailedRequest<unknown>(ExecuteCommandRequest.type, undefined, error, undefined);
        }
    }
}

/**
 * Points the commands of server-provided code actions at the ids {@link SuffixedExecuteCommandFeature} registered.
 * Commands the server did not advertise, such as ones contributed by the extension itself, are left alone.
 */
export function suffixCodeActionCommands(actions: (Command | CodeAction)[], advertised: readonly string[]): void {
    for (const action of actions) {
        const command = isCommand(action) ? action : action.command;
        if (command && advertised.includes(command.command)) {
            command.command = suffixedCommand(command.command);
        }
    }
}

function isCommand(action: Command | CodeAction): action is Command {
    return typeof action.command === 'string';
}
