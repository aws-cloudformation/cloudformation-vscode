import { Disposable, ExtensionContext, StatusBarAlignment, StatusBarItem, window } from 'vscode';
import { ExecuteCommandRequest } from 'vscode-languageclient';
import { LanguageClient } from 'vscode-languageclient/node';
import { advertisedCommand, UpdateRegionCommand } from '../lsp-server/LspCommands';
import { commandKey } from '../utils/ExtensionConfig';
import { LoggerFactory } from '../utils/Logger';
import { AwsRegion, Regions } from '../utils/Region';
import { extractErrorMessage, formatMessage } from '../utils/Utils';

export class AwsCredentialsService implements Disposable {
    private static readonly SELECTED_REGION_KEY: string = commandKey('selected.region');
    private readonly log = LoggerFactory.getLogger('AwsCredentials');

    private readonly statusBarItem: StatusBarItem;
    private client?: LanguageClient;

    constructor(private readonly context: ExtensionContext) {
        this.statusBarItem = window.createStatusBarItem(StatusBarAlignment.Left, 100);
        this.statusBarItem.command = commandKey('region.update');
        this.statusBarItem.tooltip = 'Configure AWS region';
    }

    public async initialize(client: LanguageClient): Promise<void> {
        this.client = client;
        await this.updateSelectedRegion(this.getRegion());
        await this.updateAndSaveRegion(this.getRegion());
        this.statusBarItem.show();
    }

    public async promptForRegionSelection(): Promise<void> {
        const selectedRegion = await window.showQuickPick(
            Regions.map((region) => region),
            {
                placeHolder: 'Select an AWS region',
                canPickMany: false,
            },
        );

        if (selectedRegion) {
            await this.updateAndSaveRegion(selectedRegion);
        }
    }

    private getRegion(): string {
        return this.context.globalState.get<string>(AwsCredentialsService.SELECTED_REGION_KEY) ?? AwsRegion.US_EAST_1;
    }

    private async updateSelectedRegion(region: string) {
        await this.context.globalState.update(AwsCredentialsService.SELECTED_REGION_KEY, region);
        this.statusBarItem.text = `AWS Region: ${region}`;
    }

    private async updateAndSaveRegion(region: string) {
        if (!this.client) {
            return;
        }

        try {
            window.setStatusBarMessage(formatMessage(`Updating AWS region to ${region}...`), 3000);
            await this.client.sendRequest(ExecuteCommandRequest.method, {
                command: advertisedCommand(this.client, UpdateRegionCommand),
                arguments: [region],
            });
            await this.updateSelectedRegion(region);
        } catch (error) {
            this.log.error(error, 'Failed to update AWS region');
            window.showErrorMessage(formatMessage(`Failed to update AWS region ${extractErrorMessage(error)}`));
            await this.updateSelectedRegion(this.getRegion());
        }
    }

    public dispose(): void {
        this.statusBarItem.dispose();
    }
}
