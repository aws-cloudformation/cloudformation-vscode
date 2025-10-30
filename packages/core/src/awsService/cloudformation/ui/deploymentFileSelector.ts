/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { window } from 'vscode'
import { DeploymentFileDetails } from '../cfn-init/cfnProjectTypes'

export class DeploymentFileSelector {
    public async selectDeploymentFile(
        compatibleFiles: DeploymentFileDetails[],
        requiredParameterCount: number
    ): Promise<DeploymentFileDetails | undefined> {
        const items = [
            {
                label: '$(close) Enter parameters manually',
                detail: 'Skip parameter file selection',
                parameters: undefined,
            },
            ...compatibleFiles.map((file) => {
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
            placeHolder: 'Select a parameter file or enter manually',
        })

        return selected?.parameters
    }
}
