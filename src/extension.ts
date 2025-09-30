import { workspace, ExtensionContext, window, languages } from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient/node';
import { CloseAction, ErrorAction } from 'vscode-languageclient/lib/common/client';
import { v4 as uuidv4 } from 'uuid';
import { formatMessage, isDevelopment, toString } from './utils';
import { locateServer, serverRoot } from './lspServerUtils';
import {
    debuggerCommand,
    describeTemplate,
    optimizeTemplate,
    recommendRelatedResources,
    restartCommand,
    selectProfileCommand,
    aiButtonCommand,
    generateTemplate,
} from './commands/LspCommands';
import {
    deployTemplateCommand,
    validateTemplateCommand,
    rerunLastValidationCommand,
    importResourceStateCommand,
    selectResourceTypesCommand,
    addResourceTypesCommand,
    refreshAllResourcesCommand,
    refreshResourceListCommand,
    copyResourceIdentifierCommand,
    viewStackDiffCommand,
    focusDiffCommand,
} from './commands/CfnCommands';
import { AwsCredentialsService } from './auth/awsCredentials';
import { ExtensionConfigKey, ExtensionId, ExtensionName, Version } from './ExtensionConfig';
import { CfnPanel } from './cfn/CfnPanel';
import { StacksSectionUI } from './stacks/StacksSectionUI';
import { refreshCommand, StacksManager } from './stacks/StacksManager';
import { DiffWebviewProvider } from './ui/DiffWebviewProvider';
import { DocumentManager } from './documents/DocumentManager';
import { DocumentsSectionUI } from './documents/DocumentsSectionUI';
import { DocumentPreview } from './documents/DocumentPreview';
import { ResourcesManager } from './resources/ResourcesManager';
import { ResourceSelector } from './ui/ResourceSelector';
import { ResourcesSectionUI } from './resources/ResourcesSectionUI';
import { CfnInlineCompletionProvider } from './inlineCompletion/InlineCompletionProvider';

let client: LanguageClient;

export function activate(context: ExtensionContext) {
    const isDev = isDevelopment();

    const config = workspace.getConfiguration(ExtensionConfigKey);
    const serverFile = locateServer(context);
    const serverRootDir = serverRoot(context);
    const debugPort = config.get<number>('server.debugPort', 6001);
    const envOptions = {
        NODE_OPTIONS: '--enable-source-maps',
    };

    const serverOptions: ServerOptions = {
        run: {
            module: serverFile,
            transport: TransportKind.ipc,
            options: {
                env: envOptions,
            },
        },
        debug: {
            module: serverFile,
            transport: TransportKind.ipc,
            options: {
                execArgv: isDev ? ['--nolazy', `--inspect=${debugPort}`] : ['--nolazy'],
                env: envOptions,
            },
        },
    };

    const clientOptions: LanguageClientOptions = {
        documentSelector: [
            { scheme: 'file', language: 'plaintext' },
            { scheme: 'file', language: 'cloudformation' },
            { scheme: 'file', language: 'template' },
            { scheme: 'file', language: 'json' },
            { scheme: 'file', language: 'yaml' },
            { scheme: 'file', pattern: '**/*.txt' },
            { scheme: 'file', pattern: '**/*.template' },
            { scheme: 'file', pattern: '**/*.cfn' },
            { scheme: 'file', pattern: '**/*.json' },
            { scheme: 'file', pattern: '**/*.yaml' },
        ],
        initializationOptions: {
            handledSchemaProtocols: ['file'],
            clientInfo: {
                extension: {
                    name: ExtensionId,
                    version: Version,
                },
                clientId: uuidv4(),
            },
        },
        errorHandler: {
            error: (error, message, count) => {
                window.showErrorMessage(formatMessage(`Error count = ${count}): ${toString(message)}`));
                return { action: ErrorAction.Continue };
            },
            closed: () => {
                window.showWarningMessage(formatMessage(`Server connection closed`));
                return { action: CloseAction.DoNotRestart };
            },
        },
    };

    client = new LanguageClient(ExtensionId, ExtensionName, serverOptions, clientOptions);

    const stacksManager = new StacksManager(client);
    const stacksSection = new StacksSectionUI();
    stacksManager.addListener(stacksSection.onChange());

    const documentManager = new DocumentManager(client);
    const documentSection = new DocumentsSectionUI();
    documentManager.addListener(documentSection.onChange());

    const resourceSelector = new ResourceSelector(client);
    const resourcesManager = new ResourcesManager(client, resourceSelector);
    const resourcesSection = new ResourcesSectionUI();
    resourcesManager.addListener(resourcesSection.onChange());

    const cfnPanel = new CfnPanel([resourcesSection, stacksSection, documentSection]);
    const credentialsService = new AwsCredentialsService(context, stacksManager, resourcesManager);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const preview = new DocumentPreview(client);

    // Create diff webview provider
    const diffProvider = new DiffWebviewProvider();

    client
        .start()
        .then(() => {
            const inlineCompletionProvider = languages.registerInlineCompletionItemProvider(
                [
                    { scheme: 'file', language: 'cloudformation' },
                    { scheme: 'file', language: 'yaml' },
                    { scheme: 'file', language: 'json' },
                ],
                new CfnInlineCompletionProvider(client),
            );

            context.subscriptions.push(
                client,
                inlineCompletionProvider,
                stacksManager,
                window.createTreeView('aws.cloudformation', {
                    treeDataProvider: cfnPanel,
                    showCollapseAll: true,
                }),
                addResourceTypesCommand(resourcesManager),
                refreshAllResourcesCommand(resourcesManager),
                refreshResourceListCommand(resourcesManager),
                copyResourceIdentifierCommand(),
                selectResourceTypesCommand(resourcesManager),
                importResourceStateCommand(resourcesManager),
                window.registerWebviewViewProvider('aws.cloudformation.diff', diffProvider),
                viewStackDiffCommand(),
                focusDiffCommand(),
                restartCommand(client),
                selectProfileCommand(credentialsService),
                validateTemplateCommand(client, stacksManager, diffProvider, documentManager),
                deployTemplateCommand(client, stacksManager, documentManager),
                refreshCommand(stacksManager),
                describeTemplate(client, () => {
                    return documentManager.get();
                }),
                optimizeTemplate(client, () => {
                    return documentManager.get();
                }),
                generateTemplate(client),
                aiButtonCommand(client, documentManager),
                recommendRelatedResources(client, () => {
                    return documentManager.get();
                }),
                rerunLastValidationCommand(),
                credentialsService,
            );

            if (isDev) {
                window.setStatusBarMessage(formatMessage('Running in dev mode'));
                context.subscriptions.push(debuggerCommand(debugPort, serverRootDir));
            }

            return credentialsService.initialize(client);
        })
        .catch((err) => {
            window.showErrorMessage(
                formatMessage(`Failed to start ${err instanceof Error ? err.message : toString(err)}`),
            );
        });
}

export function deactivate(): Thenable<void> | undefined {
    if (!client) {
        return undefined;
    }

    return client.stop();
}
