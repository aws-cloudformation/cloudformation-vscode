import { commands, window } from 'vscode';
import { AwsCredentialsService } from '../auth/AwsCredentials';
import { commandKey } from '../utils/ExtensionConfig';
import { extractErrorMessage, formatMessage } from '../utils/Utils';

export const RestartServerCommand = commandKey('server.restart');

export function restartCommand(call: () => Promise<void>) {
    return commands.registerCommand(RestartServerCommand, async () => {
        try {
            await call();
        } catch (error) {
            window.showErrorMessage(formatMessage(`Failed to restart server: ${extractErrorMessage(error)}`));
        }
    });
}

export function updateRegion(awsCredentialsService: AwsCredentialsService) {
    return commands.registerCommand(commandKey('region.update'), async () => {
        try {
            await awsCredentialsService.promptForRegionSelection();
        } catch (error) {
            window.showErrorMessage(formatMessage(`Error updating AWS region ${extractErrorMessage(error)}`));
        }
    });
}
