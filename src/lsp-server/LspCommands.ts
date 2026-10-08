import { LanguageClient } from 'vscode-languageclient/node';
import { CfnLspClientName } from '../utils/ExtensionConfig';

export const UpdateRegionCommand = '/command/region/update';

const CommandSuffix = `.${CfnLspClientName}`;

/** The ids the running server advertised through `executeCommandProvider`. */
export function advertisedCommands(client: LanguageClient): string[] {
    return client.initializeResult?.capabilities.executeCommandProvider?.commands ?? [];
}

/**
 * Returns the id under which the running server registered `baseCommand`: suffixed when the server honours
 * `aws.commandSuffix`, unsuffixed when it predates the option.
 */
export function advertisedCommand(client: LanguageClient, baseCommand: string): string {
    const advertised = advertisedCommands(client);
    const suffixed = suffixedCommand(baseCommand);
    const command = [suffixed, baseCommand].find((candidate) => advertised.includes(candidate));
    if (!command) {
        throw new Error(`Language server does not advertise ${suffixed} (advertised: ${advertised.join(', ')})`);
    }
    return command;
}

/** The id this client registers `command` with VS Code under, whether or not the server already suffixed it. */
export function suffixedCommand(command: string): string {
    return command.endsWith(CommandSuffix) ? command : `${command}${CommandSuffix}`;
}
