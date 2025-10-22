/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExtensionContext, window, languages } from 'vscode'
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient'
import { CloseAction, ErrorAction } from 'vscode-languageclient'
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
    loadMoreResourcesCommand,
    loadMoreStacksCommand,
    searchResourceCommand,
} from './commands/cfnCommands'
import { openStackTemplateCommand } from './commands/openStackTemplate'
import { selectRegionCommand } from './commands/regionCommands'
import { AwsCredentialsService } from './auth/credentials'
import { ExtensionId, ExtensionName, Version } from './extensionConfig'
import { CloudFormationExplorer } from './explorer/explorer'

import { refreshCommand, StacksManager } from './stacks/stacksManager'
import { DiffWebviewProvider } from './ui/diffWebviewProvider'
import { DocumentManager } from './documents/documentManager'

import { ResourcesManager } from './resources/resourcesManager'
import { ResourceSelector } from './ui/resourceSelector'

import { CfnInlineCompletionProvider } from './inlineCompletion/inlineCompletionProvider'
import { StackActionCodeLensProvider } from './codelens/stackActionCodeLensProvider'
import { getClientId } from '../../shared/telemetry/util'
import { SettingsLspServerProvider } from './lsp-server/settingsLspServerProvider'
import { DevLspServerProvider } from './lsp-server/devLspServerProvider'
import { RemoteLspServerProvider } from './lsp-server/remoteLspServerProvider'
import { LspServerProvider } from './lsp-server/lspServerProvider'
import { getLogger } from '../../shared/logger/logger'

let client: LanguageClient

export async function activate(context: ExtensionContext) {
    const serverProvider = new LspServerProvider([
        new DevLspServerProvider(context),
        new SettingsLspServerProvider(),
        new RemoteLspServerProvider(),
    ])
    const serverFile = await serverProvider.serverExecutable()
    getLogger().info(`Found CloudFormation LSP executable: ${serverFile}`)

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
        initializationOptions: {
            handledSchemaProtocols: ['file'],
            aws: {
                clientInfo: {
                    extension: {
                        name: ExtensionId,
                        version: Version,
                    },
                    clientId: getClientId(globals.globalState, globals.telemetry.telemetryEnabled),
                },
                telemetryEnabled: globals.telemetry.telemetryEnabled,
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
    const clientDisposable = client.start()

    client
        .onReady()
        .then(() => {
            const documentManager = new DocumentManager(client)

            const resourceSelector = new ResourceSelector(client)
            const resourcesManager = new ResourcesManager(client, resourceSelector)

            const cfnExplorer = new CloudFormationExplorer(
                stacksManager,
                resourcesManager,
                documentManager,
                globals.regionProvider
            )

            // Add listener to refresh explorer when resources change
            resourcesManager.addListener(() => {
                cfnExplorer.refresh()
            })

            stacksManager.addListener(() => {
                cfnExplorer.refresh()
            })

            const credentialsService = new AwsCredentialsService(stacksManager, resourcesManager)
            cfnExplorer.setCredentialsService(credentialsService)

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
                    treeDataProvider: cfnExplorer,
                    showCollapseAll: true,
                    canSelectMany: true,
                }),
                loadMoreResourcesCommand(cfnExplorer),
                loadMoreStacksCommand(cfnExplorer),
                searchResourceCommand(cfnExplorer, resourcesManager),
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
                deployTemplateCommand(client, stacksManager, documentManager),
                refreshCommand(stacksManager),
                openStackTemplateCommand(client),
                selectRegionCommand(cfnExplorer),
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
