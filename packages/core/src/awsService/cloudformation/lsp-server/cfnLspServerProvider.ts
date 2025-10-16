/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { CfnLspInstaller } from './cfnLspInstaller'

export class CfnLspServerProvider {
    private installer: CfnLspInstaller

    constructor() {
        this.installer = new CfnLspInstaller()
    }

    canProvide(): boolean {
        return true
    }

    async serverExecutable(): Promise<string> {
        const resolution = await this.installer.resolve()
        return resolution.resourcePaths.lsp
    }

    async serverRootDir(): Promise<string> {
        const resolution = await this.installer.resolve()
        return resolution.assetDirectory
    }

    close(): void {
        // BaseLspInstaller handles cleanup automatically
    }

    dispose(): void {
        this.close()
    }
}
