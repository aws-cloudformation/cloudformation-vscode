/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Uri, commands, workspace, Range, Position } from 'vscode'
import { StackChange } from '../stacks/actions/stackActionRequestType'
import * as path from 'path'
import { fs } from '../../../shared/fs/fs'
import * as os from 'os'

export class DiffViewHelper {
    static async openDiff(stackName: string, changes: StackChange[], resourceId?: string) {
        const tmpDir = os.tmpdir()
        const beforePath = path.join(tmpDir, `${stackName}-before.json`)
        const afterPath = path.join(tmpDir, `${stackName}-after.json`)

        const beforeData: Record<string, unknown> = {}
        const afterData: Record<string, unknown> = {}

        for (const change of changes) {
            const rc = change.resourceChange
            if (!rc?.logicalResourceId) {
                continue
            }

            const id = rc.logicalResourceId

            if (rc.action !== 'Add') {
                if (rc.beforeContext) {
                    try {
                        beforeData[id] = JSON.parse(rc.beforeContext) as Record<string, unknown>
                    } catch {
                        beforeData[id] = {}
                    }
                } else {
                    beforeData[id] = {}
                }
            }

            if (rc.action !== 'Remove') {
                if (rc.afterContext) {
                    try {
                        afterData[id] = JSON.parse(rc.afterContext) as Record<string, unknown>
                    } catch {
                        afterData[id] = {}
                    }
                } else {
                    afterData[id] = {}
                }
            }

            if (!rc.beforeContext && !rc.afterContext) {
                if (rc.details) {
                    for (const detail of rc.details) {
                        const target = detail.Target
                        if (target?.Name) {
                            if (rc.action !== 'Add') {
                                ;(beforeData[id] as Record<string, unknown>)[target.Name] =
                                    target.BeforeValue ?? '<UnknownBefore>'
                            }
                            if (rc.action !== 'Remove') {
                                ;(afterData[id] as Record<string, unknown>)[target.Name] =
                                    target.AfterValue ?? '<UnknownAfter>'
                            }
                        }
                    }
                }
            }
        }

        await fs.writeFile(beforePath, JSON.stringify(beforeData, undefined, 2))
        await fs.writeFile(afterPath, JSON.stringify(afterData, undefined, 2))

        const beforeUri = Uri.file(beforePath)
        const afterUri = Uri.file(afterPath)

        await commands.executeCommand('vscode.diff', beforeUri, afterUri, `${stackName}: Before ↔ After`)

        if (resourceId) {
            // Find the line with the resource ID in the after doc.
            // In a deleted resource case this will just be the top
            const editor = await workspace.openTextDocument(afterUri)
            const text = editor.getText()
            const lines = text.split('\n')
            const lineIndex = lines.findIndex((line) => line.includes(`"${resourceId}"`))

            if (lineIndex !== -1) {
                await commands.executeCommand('vscode.diff', beforeUri, afterUri, `${stackName}: Before ↔ After`, {
                    selection: new Range(new Position(lineIndex, 0), new Position(lineIndex + 1, 0)),
                })
            }
        }
    }
}
