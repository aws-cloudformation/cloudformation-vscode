import { Disposable, ExtensionContext, StatusBarAlignment, StatusBarItem, window } from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
import { commandKey, formatMessage } from '../utils';
import { fromProcess } from '@aws-sdk/credential-provider-process';
import {
    buildProfileInfo,
    Credential,
    credentialFromData,
    loadConfigFile,
    loadCredentialsFile,
    ProfileConfig,
} from './parseAuth';
import { StacksManager } from '../stacks/StacksManager';
import { ResourcesManager } from '../resources/ResourcesManager';

export class AwsCredentialsService implements Disposable {
    private static readonly credentialProcessTimeoutMs = 5000;
    // This is the key used by VSCode's Memento Global State Storage, the only value stored is the profile name NOT the credentials.
    // Only this extension has access to the profile name
    private static readonly SELECTED_PROFILE_KEY = 'aws.cloudformation.client.auth.selectedAwsProfile';

    private statusBarItem: StatusBarItem;
    private languageClient?: LanguageClient;
    private profiles: ProfileConfig[] = [];

    constructor(
        private readonly context: ExtensionContext,
        private readonly stacks: StacksManager,
        private readonly resourcesManager: ResourcesManager,
    ) {
        this.statusBarItem = window.createStatusBarItem(StatusBarAlignment.Left, 100);
        this.statusBarItem.command = commandKey('auth.selectAwsProfile');
        this.statusBarItem.tooltip = 'Configure AWS profile';
    }

    public async initialize(client: LanguageClient): Promise<void> {
        this.languageClient = client;

        await this.updateAvailableProfiles();
        await this.updateWithSavedCredentials();
        this.statusBarItem.show();
    }

    public async promptForProfileSelection(): Promise<void> {
        await this.updateAvailableProfiles();

        const selectedProfile = await window.showQuickPick(
            this.profiles.map((profile) => profile.name),
            {
                placeHolder: 'Select an AWS profile',
                canPickMany: false,
            },
        );

        if (selectedProfile) {
            await this.updateAndSaveCredentialsAndRegion(selectedProfile);
        }

        return;
    }

    private async updateWithSavedCredentials(): Promise<void> {
        return await this.updateAndSaveCredentialsAndRegion(
            this.context.globalState.get<string>(AwsCredentialsService.SELECTED_PROFILE_KEY),
        );
    }

    private async updateAvailableProfiles(): Promise<void> {
        try {
            const credentials = await loadCredentialsFile();
            const configs = await loadConfigFile();

            const profileNames = new Set<string>();
            Object.keys(credentials).forEach((name) => profileNames.add(name));
            Object.keys(configs).forEach((name) => profileNames.add(name));

            const defaultCredentials = credentials['default'] ?? {};
            const defaultConfig = configs['default'] ?? {};

            const profiles: ProfileConfig[] = [];
            for (const profileName of profileNames) {
                profiles.push(
                    buildProfileInfo(
                        profileName,
                        credentials[profileName] ?? {},
                        configs[profileName] ?? {},
                        defaultCredentials,
                        defaultConfig,
                    ),
                );
            }

            // Sort profiles (default first, then alphabetically)
            profiles.sort((a, b) => {
                if (a.name === 'default') return -1;
                if (b.name === 'default') return 1;
                return a.name.localeCompare(b.name);
            });

            if (profiles.length < 1) {
                console.warn('Found no profiles');
            }
            this.profiles = profiles;
        } catch (err) {
            console.error('Error reading AWS profiles', err);
            this.profiles = [];
        }
    }

    private updateSelectedProfile(profileName?: string, region?: string): void {
        this.context.globalState.update(AwsCredentialsService.SELECTED_PROFILE_KEY, profileName);
        if (!profileName) {
            this.statusBarItem.text = `AWS: not configured`;
            return;
        }

        let text = `AWS: ${profileName}`;
        if (region) {
            text = `${text} (${region})`;
        }

        this.statusBarItem.text = text;
    }

    private async getCredentialsForProfile(profileName?: string): Promise<Credential> {
        if (!profileName) {
            console.warn('No profile selected');
            return credentialFromData(profileName);
        }

        const profile = this.profiles.find((profile) => profile.name === profileName);
        if (!profile) {
            console.warn(`Profile ${profileName} not found`);
            return credentialFromData(profileName);
        }

        if (!profile.hasCredentials) {
            console.warn(`Profile ${profileName} has no credentials configured`);
            return credentialFromData(profileName);
        }

        if (profile.credentialProcess !== undefined) {
            try {
                // Use AWS SDK's fromProcess to get credentials with timeout
                const credentialProvider = fromProcess({ profile: profileName });

                // Create a timeout promise that rejects after the configured timeout
                const timeoutPromise = new Promise<never>((_resolve, reject) => {
                    setTimeout(() => {
                        reject(
                            new Error(
                                `Credential process timed out after ${AwsCredentialsService.credentialProcessTimeoutMs / 1000} seconds for profile ${profileName}`,
                            ),
                        );
                    }, AwsCredentialsService.credentialProcessTimeoutMs);
                });

                // Race the credential provider against the timeout
                const credential = await Promise.race([credentialProvider(), timeoutPromise]);

                return credentialFromData(
                    profileName,
                    credential.accessKeyId,
                    credential.secretAccessKey,
                    credential.sessionToken,
                    profile.region,
                );
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                const isTimeout = errorMessage.includes('timed out after');

                if (isTimeout) {
                    window.showErrorMessage(
                        formatMessage(
                            `Credential process timed out for profile ${profileName}. Please check your credential_process configuration.`,
                        ),
                    );
                }
            }
        }

        return credentialFromData(
            profileName,
            profile.credential?.accessKeyId,
            profile.credential?.secretAccessKey,
            profile.credential?.sessionToken,
            profile.region,
        );
    }

    private async updateAndSaveCredentialsAndRegion(profileName?: string) {
        if (!this.languageClient) {
            return;
        }

        const credential = await this.getCredentialsForProfile(profileName);

        try {
            window.setStatusBarMessage(formatMessage(`Updating AWS profile to ${profileName}...`), 3000);
            await this.languageClient.sendRequest('aws/credentials/iam/update', credential);
            this.updateSelectedProfile(credential.data.profile, credential.data.region);
        } catch (error) {
            window.showErrorMessage(
                formatMessage(`Failed to update AWS profile.${error instanceof Error ? ` ${error.message}` : ''}`),
            );
            this.updateSelectedProfile(undefined, undefined);
        } finally {
            this.stacks.reload();
            this.resourcesManager.reload();
        }
    }

    public dispose(): void {
        this.statusBarItem.dispose();
    }
}
