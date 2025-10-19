/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExtensionContext, window, languages } from 'vscode'
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient'
import { CloseAction, ErrorAction } from 'vscode-languageclient'
import { v4 as uuidv4 } from 'uuid'
import { formatMessage, toString } from './utils'
import { restartCommand } from './commands/lspCommands'
import globals from '../../shared/extensionGlobals'
import {
    deployTemplateCommand,
    validateTemplateCommand,
    rerunLastValidationCommand,
    importResourceStateCommand,
    cloneResourceStateCommand,
    selectResourceTypesCommand,
    addResourceTypesCommand,
    refreshAllResourcesCommand,
    refreshResourceListCommand,
    copyResourceIdentifierCommand,
    viewStackDiffCommand,
    focusDiffCommand,
    getStackManagementInfoCommand,
    extractToParameterPositionCursorCommand,
    getStackManagementInfoCommandPalette,
} from './commands/cfnCommands'
import { openStackTemplateCommand } from './commands/openStackTemplate'
import { AwsCredentialsService } from './auth/credentials'
import { ExtensionId, ExtensionName, Version } from './extensionConfig'
import { CfnPanel } from './cfn/cfnPanel'
import { StacksSectionUI } from './stacks/stacksSectionUI'
import { refreshCommand, StacksManager } from './stacks/stacksManager'
import { DiffWebviewProvider } from './ui/diffWebviewProvider'
import { DocumentManager } from './documents/documentManager'
import { DocumentsSectionUI } from './documents/documentsSectionUI'

import { ResourcesManager } from './resources/resourcesManager'
import { ResourceSelector } from './ui/resourceSelector'
import { ResourcesSectionUI } from './resources/resourcesSectionUI'
import { CfnInlineCompletionProvider } from './inlineCompletion/inlineCompletionProvider'
import { StackActionCodeLensProvider } from './codelens/stackActionCodeLensProvider'
import { CfnLspServerProvider } from './lsp-server/cfnLspServerProvider'

let client: LanguageClient

export async function activate(context: ExtensionContext) {
    const serverProvider = new CfnLspServerProvider()
    const serverFile = await serverProvider.serverExecutable()

    const envOptions = {
        NODE_OPTIONS: '--enable-source-maps',
    }

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
                execArgv: ['--no-lazy'],
                env: envOptions,
            },
        },
    }

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
        outputChannel: globals.outputChannel,
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
                void window.showErrorMessage(formatMessage(`Error count = ${count}): ${toString(message)}`))
                return ErrorAction.Continue
            },
            closed: () => {
                void window.showWarningMessage(formatMessage(`Server connection closed`))
                return CloseAction.DoNotRestart
            },
        },
    }

    client = new LanguageClient(ExtensionId, ExtensionName, serverOptions, clientOptions)

    const stacksManager = new StacksManager(client)
    const stacksSection = new StacksSectionUI()
    stacksManager.addListener(stacksSection.onChange())

    const clientDisposable = client.start()

    client
        .onReady()
        .then(() => {
            const documentManager = new DocumentManager(client)
            const documentSection = new DocumentsSectionUI()
            documentManager.addListener(documentSection.onChange())

            const resourceSelector = new ResourceSelector(client)
            const resourcesManager = new ResourcesManager(client, resourceSelector)
            const resourcesSection = new ResourcesSectionUI()
            resourcesManager.addListener(resourcesSection.onChange())

            const cfnPanel = new CfnPanel([resourcesSection, stacksSection, documentSection])
            const credentialsService = new AwsCredentialsService(stacksManager, resourcesManager)

            // Create diff webview provider
            const diffProvider = new DiffWebviewProvider()

            const documentSelector = [
                { scheme: 'file', language: 'cloudformation' },
                { scheme: 'file', language: 'yaml' },
                { scheme: 'file', language: 'json' },
            ]

            const inlineCompletionProvider = languages.registerInlineCompletionItemProvider(
                documentSelector,
                new CfnInlineCompletionProvider(client)
            )

            const codeLensProvider = languages.registerCodeLensProvider(
                documentSelector,
                new StackActionCodeLensProvider(client)
            )

            context.subscriptions.push(
                clientDisposable,
                inlineCompletionProvider,
                codeLensProvider,
                stacksManager,
                window.createTreeView('aws.cloudformation', {
                    treeDataProvider: cfnPanel,
                    showCollapseAll: true,
                    canSelectMany: true,
                }),
                addResourceTypesCommand(resourcesManager),
                refreshAllResourcesCommand(resourcesManager),
                refreshResourceListCommand(resourcesManager),
                copyResourceIdentifierCommand(),
                selectResourceTypesCommand(resourcesManager),
                ...importResourceStateCommand(resourcesManager),
                ...cloneResourceStateCommand(resourcesManager),
                getStackManagementInfoCommand(resourcesManager),
                getStackManagementInfoCommandPalette(resourcesManager),
                window.registerWebviewViewProvider('aws.cloudformation.diff', diffProvider),
                viewStackDiffCommand(),
                focusDiffCommand(),
                restartCommand(client),
                validateTemplateCommand(client, stacksManager, diffProvider, documentManager),
                deployTemplateCommand(client, stacksManager, diffProvider, documentManager),
                refreshCommand(stacksManager),
                openStackTemplateCommand(client),
                rerunLastValidationCommand(),
                extractToParameterPositionCursorCommand(),
                credentialsService,
                serverProvider
            )

            return credentialsService.initialize(client)
        })
        .catch((err: any) => {
            void window.showErrorMessage(
                formatMessage(`Failed to start ${err instanceof Error ? err.message : toString(err)}`)
            )
        })
}

export function deactivate(): Thenable<void> | undefined {
    if (!client) {
        return undefined
    }

    return client.stop()
}
