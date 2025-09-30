import { AwsCredentialsService } from '../../src/auth/awsCredentials';
import { window, ExtensionContext, StatusBarItem } from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
import { fromProcess } from '@aws-sdk/credential-provider-process';
import * as parseAuth from '../../src/auth/parseAuth';
import { StacksManager } from '../../src/stacks/StacksManager';
import { ResourcesManager } from '../../src/resources/ResourcesManager';

jest.mock('vscode');
jest.mock('vscode-languageclient/node', () => ({
    LanguageClient: jest.fn(),
    ExecuteCommandRequest: {
        method: 'workspace/executeCommand',
    },
}));
jest.mock('@aws-sdk/credential-provider-process');
jest.mock('../../src/auth/parseAuth');
jest.mock('../../src/commands/CfnCommands');
jest.mock('../../src/stacks/StacksManager');
jest.spyOn(console, 'warn').mockImplementation(() => {});
jest.spyOn(console, 'error').mockImplementation(() => {});

describe('AwsCredentialsService', () => {
    let service: AwsCredentialsService;
    let mockContext: jest.Mocked<ExtensionContext>;
    let mockStatusBarItem: jest.Mocked<StatusBarItem>;
    let mockLanguageClient: jest.Mocked<LanguageClient>;
    let mockStacksManager: jest.Mocked<StacksManager>;
    let mockResourcesManager: jest.Mocked<ResourcesManager>;
    let mockGlobalState: { get: jest.Mock; update: jest.Mock };

    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();

        // Setup mock objects
        mockStatusBarItem = {
            show: jest.fn(),
            hide: jest.fn(),
            dispose: jest.fn(),
            text: '',
            tooltip: '',
            command: '',
        } as any;

        mockGlobalState = {
            get: jest.fn(),
            update: jest.fn(),
        };

        mockContext = {
            globalState: mockGlobalState,
        } as any;

        mockLanguageClient = {
            sendRequest: jest.fn().mockResolvedValue(undefined),
        } as any;

        mockStacksManager = {
            reload: jest.fn(),
            startPolling: jest.fn(),
            stopPolling: jest.fn(),
            dispose: jest.fn(),
            addListener: jest.fn(),
            get: jest.fn().mockReturnValue([]),
        } as any;

        mockResourcesManager = {
            loadResources: jest.fn(),
            reload: jest.fn(),
        } as any;

        // Setup vscode mocks
        (window.createStatusBarItem as jest.Mock).mockReturnValue(mockStatusBarItem);
        (window.showQuickPick as jest.Mock).mockResolvedValue(undefined);
        (window.showErrorMessage as jest.Mock).mockResolvedValue(undefined);
        (window.setStatusBarMessage as jest.Mock).mockReturnValue(undefined);

        // Setup parseAuth mocks with default values
        (parseAuth.loadCredentialsFile as jest.Mock).mockResolvedValue({});
        (parseAuth.loadConfigFile as jest.Mock).mockResolvedValue({});
        (parseAuth.buildProfileInfo as jest.Mock).mockReturnValue({
            name: 'default',
            hasCredentials: true,
        });
        (parseAuth.credentialFromData as jest.Mock).mockReturnValue({
            data: { profile: undefined },
            encrypted: false,
        });

        service = new AwsCredentialsService(mockContext, mockStacksManager, mockResourcesManager);
    });

    describe('constructor', () => {
        it('should initialize status bar item', () => {
            new AwsCredentialsService(mockContext, mockStacksManager, mockResourcesManager);
            expect(window.createStatusBarItem).toHaveBeenCalled();
        });
    });

    describe('initialize', () => {
        it('should initialize with language client and show status bar', async () => {
            await service.initialize(mockLanguageClient);
            expect(mockStatusBarItem.show).toHaveBeenCalled();
        });
    });

    describe('promptForProfileSelection', () => {
        it('should prompt with correct profile list and update credentials on selection', async () => {
            // Setup profiles to be returned - need to ensure they're actually added to the profiles array
            (parseAuth.loadCredentialsFile as jest.Mock).mockResolvedValue({
                default: { aws_access_key_id: 'key1' },
                profile1: { aws_access_key_id: 'key2' },
            });
            (parseAuth.loadConfigFile as jest.Mock).mockResolvedValue({});

            // Mock buildProfileInfo to return different profiles for each call
            (parseAuth.buildProfileInfo as jest.Mock)
                .mockReturnValueOnce({ name: 'default', hasCredentials: true, region: 'us-east-1' })
                .mockReturnValueOnce({ name: 'profile1', hasCredentials: true, region: 'us-west-2' });

            (window.showQuickPick as jest.Mock).mockResolvedValue('profile1');

            // Mock the credential that will be returned for profile1
            (parseAuth.credentialFromData as jest.Mock).mockReturnValue({
                data: { profile: 'profile1', region: 'us-west-2', accessKeyId: 'key2' },
                encrypted: false,
            });

            await service.initialize(mockLanguageClient);

            // Reset the mock call count since initialize calls updateAvailableProfiles
            jest.clearAllMocks();

            // Setup the mocks again for the promptForProfileSelection call
            (parseAuth.loadCredentialsFile as jest.Mock).mockResolvedValue({
                default: { aws_access_key_id: 'key1' },
                profile1: { aws_access_key_id: 'key2' },
            });
            (parseAuth.loadConfigFile as jest.Mock).mockResolvedValue({});
            (parseAuth.buildProfileInfo as jest.Mock)
                .mockReturnValueOnce({ name: 'default', hasCredentials: true, region: 'us-east-1' })
                .mockReturnValueOnce({ name: 'profile1', hasCredentials: true, region: 'us-west-2' });
            (window.showQuickPick as jest.Mock).mockResolvedValue('profile1');
            (parseAuth.credentialFromData as jest.Mock).mockReturnValue({
                data: { profile: 'profile1', region: 'us-west-2', accessKeyId: 'key2' },
                encrypted: false,
            });

            await service.promptForProfileSelection();

            // Verify the profile list shown to user (should contain both profiles)
            expect(window.showQuickPick).toHaveBeenCalledWith(['default', 'profile1'], {
                placeHolder: 'Select an AWS profile',
                canPickMany: false,
            });

            // Verify credentials were sent to language client
            expect(mockLanguageClient.sendRequest).toHaveBeenCalledWith(
                'aws/credentials/iam/update',
                expect.objectContaining({
                    data: expect.objectContaining({
                        profile: 'profile1',
                        region: 'us-west-2',
                        accessKeyId: 'key2',
                    }),
                }),
            );

            // Verify global state was updated
            expect(mockGlobalState.update).toHaveBeenCalledWith(
                'aws.cloudformation.client.auth.selectedAwsProfile',
                'profile1',
            );

            // Verify cfnTree.loadStacks was called
            expect(mockStacksManager.reload).toHaveBeenCalled();
        });

        it('should handle no selection gracefully', async () => {
            (window.showQuickPick as jest.Mock).mockResolvedValue(undefined);

            await service.promptForProfileSelection();

            expect(window.showQuickPick).toHaveBeenCalled();
            // Should not update credentials when no selection is made
            expect(mockLanguageClient.sendRequest).not.toHaveBeenCalledWith(
                'aws/credentials/iam/update',
                expect.anything(),
            );
            // Should not call loadStacks when no selection is made
            expect(mockStacksManager.reload).not.toHaveBeenCalled();
        });
    });

    describe('credential process handling', () => {
        it('should handle credential process successfully', async () => {
            const mockProfile = {
                name: 'test-profile',
                hasCredentials: true,
                credentialProcess: 'aws sts assume-role',
                region: 'us-east-1',
            };

            // Setup profile loading to include the test profile
            (parseAuth.loadCredentialsFile as jest.Mock).mockResolvedValue({
                'test-profile': { credential_process: 'aws sts assume-role' },
            });
            (parseAuth.loadConfigFile as jest.Mock).mockResolvedValue({
                'test-profile': { region: 'us-east-1' },
            });
            (parseAuth.buildProfileInfo as jest.Mock).mockReturnValue(mockProfile);

            const mockCredentials = {
                accessKeyId: 'AKIA123',
                secretAccessKey: 'secret123',
                sessionToken: 'token123',
            };

            const mockCredentialProvider = jest.fn().mockResolvedValue(mockCredentials);
            (fromProcess as jest.Mock).mockReturnValue(mockCredentialProvider);

            // Mock the final credential object
            (parseAuth.credentialFromData as jest.Mock).mockReturnValue({
                data: {
                    profile: 'test-profile',
                    region: 'us-east-1',
                    accessKeyId: 'AKIA123',
                    secretAccessKey: 'secret123',
                    sessionToken: 'token123',
                },
                encrypted: false,
            });

            await service.initialize(mockLanguageClient);
            (window.showQuickPick as jest.Mock).mockResolvedValue('test-profile');
            await service.promptForProfileSelection();

            // Verify credential process was called
            expect(fromProcess).toHaveBeenCalledWith({ profile: 'test-profile' });

            // Verify credential data was built correctly
            expect(parseAuth.credentialFromData).toHaveBeenCalledWith(
                'test-profile',
                'AKIA123',
                'secret123',
                'token123',
                'us-east-1',
            );

            // Verify credentials were sent to language client
            expect(mockLanguageClient.sendRequest).toHaveBeenCalledWith(
                'aws/credentials/iam/update',
                expect.objectContaining({
                    data: expect.objectContaining({
                        profile: 'test-profile',
                        accessKeyId: 'AKIA123',
                        secretAccessKey: 'secret123',
                        sessionToken: 'token123',
                    }),
                }),
            );

            // Verify cfnTree.loadStacks was called
            expect(mockStacksManager.reload).toHaveBeenCalled();
        });

        it('should handle credential process timeout', async () => {
            const mockProfile = {
                name: 'test-profile',
                hasCredentials: true,
                credentialProcess: 'aws sts assume-role',
                region: 'us-east-1',
            };

            // Setup profile loading to include the test profile
            (parseAuth.loadCredentialsFile as jest.Mock).mockResolvedValue({
                'test-profile': { credential_process: 'aws sts assume-role' },
            });
            (parseAuth.loadConfigFile as jest.Mock).mockResolvedValue({
                'test-profile': { region: 'us-east-1' },
            });
            (parseAuth.buildProfileInfo as jest.Mock).mockReturnValue(mockProfile);

            // Mock fromProcess to return a provider that throws a timeout error
            const mockCredentialProvider = jest
                .fn()
                .mockRejectedValue(new Error('Credential process timed out after 5 seconds for profile test-profile'));
            (fromProcess as jest.Mock).mockReturnValue(mockCredentialProvider);

            // Mock credentialFromData to return fallback credential (called when credential process fails)
            (parseAuth.credentialFromData as jest.Mock).mockReturnValue({
                data: { profile: 'Unknown', region: 'us-east-1' },
                encrypted: false,
            });

            await service.initialize(mockLanguageClient);
            (window.showQuickPick as jest.Mock).mockResolvedValue('test-profile');

            await service.promptForProfileSelection();

            // Verify error message was shown for timeout
            expect(window.showErrorMessage).toHaveBeenCalledWith(
                expect.stringContaining('Credential process timed out for profile test-profile'),
            );

            // Verify that credentials were still sent (with fallback)
            expect(mockLanguageClient.sendRequest).toHaveBeenCalledWith(
                'aws/credentials/iam/update',
                expect.objectContaining({
                    data: expect.objectContaining({ profile: 'Unknown' }),
                }),
            );

            // Verify cfnTree.loadStacks was called even on timeout
            expect(mockStacksManager.reload).toHaveBeenCalled();
        });
    });

    describe('error handling', () => {
        beforeEach(async () => {
            await service.initialize(mockLanguageClient);
        });

        it('should handle language client request failures', async () => {
            mockLanguageClient.sendRequest.mockRejectedValue(new Error('Network error'));
            (window.showQuickPick as jest.Mock).mockResolvedValue('test-profile');

            await service.promptForProfileSelection();

            expect(window.showErrorMessage).toHaveBeenCalledWith(
                expect.stringContaining('Failed to update AWS profile'),
            );

            // Verify cfnTree.loadStacks was called even on error
            expect(mockStacksManager.reload).toHaveBeenCalled();
        });

        it('should handle missing profile gracefully', async () => {
            // Setup some profiles first
            (parseAuth.loadCredentialsFile as jest.Mock).mockResolvedValue({
                default: { aws_access_key_id: 'key1' },
            });
            (parseAuth.loadConfigFile as jest.Mock).mockResolvedValue({});
            (parseAuth.buildProfileInfo as jest.Mock).mockReturnValue({
                name: 'default',
                hasCredentials: true,
            });

            // Mock credentialFromData to return 'Unknown' for missing profile
            (parseAuth.credentialFromData as jest.Mock).mockReturnValue({
                data: { profile: 'Unknown' },
                encrypted: false,
            });

            (window.showQuickPick as jest.Mock).mockResolvedValue('non-existent-profile');

            await service.promptForProfileSelection();

            // Should handle missing profile without throwing
            expect(window.showQuickPick).toHaveBeenCalled();

            // Should still attempt to send credentials (with 'Unknown' profile)
            expect(mockLanguageClient.sendRequest).toHaveBeenCalledWith(
                'aws/credentials/iam/update',
                expect.objectContaining({
                    data: expect.objectContaining({ profile: 'Unknown' }),
                }),
            );

            // Verify cfnTree.loadStacks was called even with missing profile
            expect(mockStacksManager.reload).toHaveBeenCalled();
        });
    });

    describe('status bar updates', () => {
        it('should update status bar text when profile is selected', async () => {
            const profile = 'my-profile';
            (parseAuth.credentialFromData as jest.Mock).mockReturnValue({
                data: { profile },
                encrypted: false,
            });
            mockGlobalState.get.mockReturnValue(profile);

            const newService = new AwsCredentialsService(mockContext, mockStacksManager, mockResourcesManager);
            await newService.initialize(mockLanguageClient);

            // The status bar text is updated during the updateSelectedProfile call
            // which happens after credential processing, so we need to check the final state
            expect(mockStatusBarItem.text).toBe('AWS: my-profile');
        });

        it('should show not configured when no profile is selected', async () => {
            mockGlobalState.get.mockReturnValue(undefined);

            const newService = new AwsCredentialsService(mockContext, mockStacksManager, mockResourcesManager);
            await newService.initialize(mockLanguageClient);

            // Verify status bar text shows not configured
            expect(mockStatusBarItem.text).toBe('AWS: not configured');
        });
    });

    describe('updateAndSaveCredentialsAndRegion behavior', () => {
        beforeEach(async () => {
            await service.initialize(mockLanguageClient);
            expect(mockLanguageClient.sendRequest).toHaveBeenCalledTimes(1);
        });

        it('should send correct credential data to language client', async () => {
            const mockCredential = {
                data: {
                    profile: 'test-profile',
                    accessKeyId: 'AKIA123',
                    secretAccessKey: 'secret123',
                    region: 'us-west-2',
                },
                encrypted: false,
            };

            (parseAuth.credentialFromData as jest.Mock).mockReturnValue(mockCredential);
            (window.showQuickPick as jest.Mock).mockResolvedValue('test-profile');

            await service.promptForProfileSelection();

            // Verify the exact credential data sent to language client
            expect(mockLanguageClient.sendRequest).toHaveBeenCalledTimes(2);
            expect(mockLanguageClient.sendRequest).toHaveBeenNthCalledWith(
                2,
                'aws/credentials/iam/update',
                mockCredential,
            );

            // Verify status bar was updated
            expect(mockStatusBarItem.text).toBe('AWS: test-profile (us-west-2)');

            // Verify global state was updated
            expect(mockGlobalState.update).toHaveBeenCalledWith(
                'aws.cloudformation.client.auth.selectedAwsProfile',
                'test-profile',
            );

            // Verify status message was shown (uses aws.cloudformation: prefix)
            expect(window.setStatusBarMessage).toHaveBeenCalledWith(
                'aws.cloudformation: Updating AWS profile to test-profile...',
                3000,
            );

            // Verify cfnTree.loadStacks was called
            expect(mockStacksManager.reload).toHaveBeenCalled();
        });

        it('should handle updateAndSaveCredentialsAndRegion failure', async () => {
            // Setup profiles first
            (parseAuth.loadCredentialsFile as jest.Mock).mockResolvedValue({
                'test-profile': { aws_access_key_id: 'key1' },
            });
            (parseAuth.loadConfigFile as jest.Mock).mockResolvedValue({});
            (parseAuth.buildProfileInfo as jest.Mock).mockReturnValue({
                name: 'test-profile',
                hasCredentials: true,
            });

            mockLanguageClient.sendRequest.mockRejectedValue(new Error('Connection failed'));
            (window.showQuickPick as jest.Mock).mockResolvedValue('test-profile');

            await service.promptForProfileSelection();

            // Verify error message was shown (uses aws.cloudformation: prefix)
            expect(window.showErrorMessage).toHaveBeenCalledWith(
                'aws.cloudformation: Failed to update AWS profile. Connection failed',
            );

            // Verify profile was reset to undefined on failure
            expect(mockStatusBarItem.text).toBe('AWS: not configured');
            expect(mockGlobalState.update).toHaveBeenCalledWith(
                'aws.cloudformation.client.auth.selectedAwsProfile',
                undefined,
            );

            // Verify cfnTree.loadStacks was called even on failure
            expect(mockStacksManager.reload).toHaveBeenCalled();
        });
    });
});
