/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { TreeItemCollapsibleState } from 'vscode'
import { AWSTreeNodeBase } from '../../../../shared/treeview/nodes/awsTreeNodeBase'

export class ResourceNode extends AWSTreeNodeBase {
    public constructor(
        public readonly resource: any,
        public readonly resourceType?: string,
        resourceIdentifier?: string
    ) {
        super(resource.name || resource.resourceIdentifier || 'Unknown Resource', TreeItemCollapsibleState.None)
        this.contextValue = 'resource'
        this.description = resource.typeName || resourceType
        this.resourceType = resourceType || resource.typeName
        this.resourceIdentifier = resourceIdentifier || resource.resourceIdentifier || ''
    }

    // Ensure resourceIdentifier is always a string
    public readonly resourceIdentifier: string

    // Add resourceList property for backward compatibility
    public get resourceList() {
        return this.resource
    }

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        return []
    }
}
