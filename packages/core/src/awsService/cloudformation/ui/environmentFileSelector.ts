/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { window } from 'vscode'
import { EnvironmentFileSelectorItem } from '../cfn-init/cfnProjectTypes'

export class EnvironmentFileSelector {
    public async selectEnvironmentFile(
        files: EnvironmentFileSelectorItem[],
        requiredParameterCount: number
    ): Promise<EnvironmentFileSelectorItem | undefined> {
        // Sort files: matching template path first, then by compatible parameter count (descending)
        const sortedFiles = files.sort((a, b) => {
            // First sort by hasMatchingTemplatePath (true first)
            if (a.hasMatchingTemplatePath !== b.hasMatchingTemplatePath) {
                return a.hasMatchingTemplatePath ? -1 : 1
            }

            // Then sort by compatible parameter count (higher first)
            const aCount = a.compatibleParameters?.length ?? 0
            const bCount = b.compatibleParameters?.length ?? 0
            return bCount - aCount
        })

        const items = [
            {
                label: '$(close) Enter parameters manually',
                detail: 'Skip parameter file selection',
                parameters: undefined,
            },
            ...sortedFiles.map((file) => {
                const compatibleCount = file.compatibleParameters?.length ?? 0
                const countText = `${compatibleCount}/${requiredParameterCount} parameters match`

                return {
                    label: file.hasMatchingTemplatePath ? `$(star-full) ${file.fileName}` : file.fileName,
                    detail: file.hasMatchingTemplatePath ? `Matching template path • ${countText}` : countText,
                    parameters: file,
                }
            }),
        ]

        const selected = await window.showQuickPick(items, {
            placeHolder: 'Select an environment file or enter manually',
        })

        return selected?.parameters
    }
}
