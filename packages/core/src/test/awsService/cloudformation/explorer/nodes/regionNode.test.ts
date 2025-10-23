/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { TreeItemCollapsibleState } from 'vscode'
import { RegionNode } from '../../../../../awsService/cloudformation/explorer/nodes/regionNode'
import { Region } from '../../../../../shared/regions/endpoints'

describe('RegionNode', function () {
    let mockRegion: Region
    let mockStacksManager: any
    let mockResourcesManager: any
    let regionNode: RegionNode

    beforeEach(function () {
        mockRegion = {
            id: 'us-east-1',
            name: 'US East (N. Virginia)',
        }
        mockStacksManager = { get: () => [] }
        mockResourcesManager = { get: () => [] }

        regionNode = new RegionNode(mockRegion, mockStacksManager, mockResourcesManager, {} as any)
    })

    describe('constructor', function () {
        it('should set correct properties', function () {
            assert.strictEqual(regionNode.label, 'US East (N. Virginia)')
            assert.strictEqual(regionNode.description, 'us-east-1')
            assert.strictEqual(regionNode.contextValue, 'region')
            assert.strictEqual(regionNode.collapsibleState, TreeItemCollapsibleState.Collapsed)
        })
    })

    describe('getChildren', function () {
        it('should return stacks and resources sections', async function () {
            const children = await regionNode.getChildren()
            assert.strictEqual(children.length, 2)

            const stacksSection = children.find((child) => child.label === 'Stacks')
            const resourcesSection = children.find((child) => child.label === 'Resources')

            assert(stacksSection !== undefined, 'Should include Stacks section')
            assert(resourcesSection !== undefined, 'Should include Resources section')
        })
    })
})
