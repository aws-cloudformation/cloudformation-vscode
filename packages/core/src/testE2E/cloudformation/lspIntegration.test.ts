/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import * as path from 'path'
import * as os from 'os'
import { mkdtemp, rm, writeFile } from 'fs/promises'

describe('CloudFormation LSP Integration E2E', function () {
    let testDocument: vscode.TextDocument
    let testFileUri: vscode.Uri
    let testDir: string

    before(async function () {
        const envPath = process.env.__CLOUDFORMATIONLSP_PATH
        if (envPath) {
            console.log(`Using local LSP server from: ${envPath}`)
        } else {
            console.log('No __CLOUDFORMATIONLSP_PATH set, will download LSP from GitHub')
        }

        const extension = vscode.extensions.getExtension('amazonwebservices.aws-toolkit-vscode')
        if (extension && !extension.isActive) {
            await extension.activate()
        }

        testDir = await mkdtemp(path.join(os.tmpdir(), 'cfn-lsp-test-'))
        const testFilePath = path.join(testDir, 'test-template.yaml')
        await writeFile(testFilePath, 'AWSTemplateFormatVersion: "2010-09-09"\n', 'utf-8')
        testFileUri = vscode.Uri.file(testFilePath)

        testDocument = await vscode.workspace.openTextDocument(testFileUri)
        await vscode.window.showTextDocument(testDocument)
    })

    after(async function () {
        if (testDocument) {
            await vscode.commands.executeCommand('workbench.action.closeAllEditors')
        }
        try {
            await rm(testDir, { recursive: true, force: true })
        } catch (error) {
            console.warn('Failed to clean up test directory:', error)
        }
    })

    it('should provide autocomplete for CloudFormation top-level sections', async function () {
        const position = new vscode.Position(1, 0)

        const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider',
            testFileUri,
            position
        )

        assert.ok(completions, 'Should receive completion items')
        assert.ok(completions.items.length > 0, 'Should have completion items')

        const labels = completions.items.map((i) => (typeof i.label === 'string' ? i.label : i.label.label))

        const cfnSections = ['Description', 'Resources', 'Parameters', 'Outputs', 'Metadata']
        const found = labels.filter((label) => cfnSections.some((section) => label.includes(section)))

        assert.ok(found.length > 0, `Should have CloudFormation sections. Got: ${labels.join(', ')}`)
    })
})
