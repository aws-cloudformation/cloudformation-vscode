/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { TreeItemCollapsibleState } from 'vscode'
import { ResourceTypeNode } from '../../../../../awsService/cloudformation/explorer/nodes/resourceTypeNode'
import { ResourceList } from '../../../../../awsService/cloudformation/cfn/resourceRequestTypes'
import { ResourcesManager } from '../../../../../awsService/cloudformation/resources/resourcesManager'

describe('ResourceTypeNode', function () {
    let mockResourceList: ResourceList
    let resourceTypeNode: ResourceTypeNode
    let mockResourcesManager: ResourcesManager

    beforeEach(function () {
        mockResourceList = {
            typeName: 'AWS::S3::Bucket',
            resourceIdentifiers: ['bucket-1', 'bucket-2', 'bucket-3'],
        }

        mockResourcesManager = {} as ResourcesManager

        resourceTypeNode = new ResourceTypeNode(mockResourceList, mockResourcesManager)
    })

    describe('constructor', function () {
        it('should set correct properties', function () {
            assert.strictEqual(resourceTypeNode.label, 'AWS::S3::Bucket')
            assert.strictEqual(resourceTypeNode.description, '(3)')
            assert.strictEqual(resourceTypeNode.contextValue, 'resourceType')
            assert.strictEqual(resourceTypeNode.collapsibleState, TreeItemCollapsibleState.Collapsed)
        })
    })

    describe('getChildren', function () {
        it('should return resource nodes for each identifier', async function () {
            const children = await resourceTypeNode.getChildren()
            assert.strictEqual(children.length, 3)

            const labels = children.map((child) => child.label)
            assert(labels.includes('bucket-1'))
            assert(labels.includes('bucket-2'))
            assert(labels.includes('bucket-3'))
        })
    })

    describe('empty resource list', function () {
        it('should handle empty resource identifiers', async function () {
            const emptyResourceList: ResourceList = {
                typeName: 'AWS::Lambda::Function',
                resourceIdentifiers: [],
            }

            const emptyNode = new ResourceTypeNode(emptyResourceList, mockResourcesManager)
            assert.strictEqual(emptyNode.description, '(0)')

            const children = await emptyNode.getChildren()
            assert.strictEqual(children.length, 1)
            assert.strictEqual(children[0].label, 'No resources found')
        })
    })
})
