/*!
import { getLogger } from '../../../shared/logger'
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    CancellationToken,
    InlineCompletionContext,
    InlineCompletionItem,
    InlineCompletionItemProvider,
    InlineCompletionList,
    Position,
    TextDocument,
} from 'vscode'
import { LanguageClient } from 'vscode-languageclient'
import { getLogger } from '../../../shared/logger/logger'

export class CfnInlineCompletionProvider implements InlineCompletionItemProvider {
    constructor(private readonly client: LanguageClient) {}

    async provideInlineCompletionItems(
        document: TextDocument,
        position: Position,
        context: InlineCompletionContext,
        token: CancellationToken
    ): Promise<InlineCompletionItem[] | undefined> {
        try {
            const result = await this.client.sendRequest<InlineCompletionList | undefined>(
                'textDocument/inlineCompletion',
                {
                    textDocument: { uri: document.uri.toString() },
                    position: { line: position.line, character: position.character },
                    context: {
                        triggerKind: context.triggerKind,
                        selectedCompletionInfo: context.selectedCompletionInfo,
                    },
                },
                token
            )

            if (result) {
                return result.items
            }
            return undefined
        } catch (error) {
            if (token.isCancellationRequested) {
                return undefined
            }
            getLogger().error(`Inline completion error: ${error}`)
            return undefined
        }
    }
}
