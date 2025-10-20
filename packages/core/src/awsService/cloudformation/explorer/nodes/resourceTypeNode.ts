/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { TreeItemCollapsibleState } from 'vscode'
import { AWSTreeNodeBase } from '../../../../shared/treeview/nodes/awsTreeNodeBase'
import { ResourceList } from '../../cfn/resourceRequestTypes'
import { ResourceNode } from './resourceNode'

export class ResourceTypeNode extends AWSTreeNodeBase {
    public constructor(private readonly resourceList: ResourceList) {
        super(resourceList.typeName, TreeItemCollapsibleState.Collapsed)
        this.contextValue = 'resourceType'
        this.description = `(${resourceList.resourceIdentifiers.length})`
    }

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        return this.resourceList.resourceIdentifiers.map(
            (identifier) =>
                new ResourceNode(
                    { name: identifier, resourceIdentifier: identifier },
                    this.resourceList.typeName,
                    identifier
                )
        )
    }
}
