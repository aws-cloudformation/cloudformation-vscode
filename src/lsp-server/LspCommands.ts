import { LanguageClient } from 'vscode-languageclient/node';
import { CfnLspCommandSuffix } from './LspClientConfig';

export const UpdateRegionCommand = '/command/region/update';

/**
 * Returns the id under which the running server registered `baseCommand`: suffixed when the server honours
 * `aws.commandSuffix`, unsuffixed when it predates the option.
 */
export function advertisedCommand(client: LanguageClient, baseCommand: string): string {
    const advertised = client.initializeResult?.capabilities.executeCommandProvider?.commands ?? [];
    const suffixed = `${baseCommand}.${CfnLspCommandSuffix}`;
    const command = [suffixed, baseCommand].find((candidate) => advertised.includes(candidate));
    if (!command) {
        throw new Error(`Language server does not advertise ${suffixed} (advertised: ${advertised.join(', ')})`);
    }
    return command;
}
