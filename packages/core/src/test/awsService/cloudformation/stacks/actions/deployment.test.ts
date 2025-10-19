/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import {
    Deployment,
    getLastDeployment,
    setLastDeployment,
} from '../../../../../awsService/cloudformation/stacks/actions/deploymentWorkflow'
import { DiffWebviewProvider } from '../../../../../awsService/cloudformation/ui/diffWebviewProvider'
import { StackChange } from '../../../../../awsService/cloudformation/stacks/actions/stackActionRequestType'

describe('Deployment', function () {
    let sandbox: sinon.SinonSandbox

    beforeEach(function () {
        sandbox = sinon.createSandbox()
    })

    afterEach(function () {
        sandbox.restore()
    })

    describe('last deployment tracking', function () {
        it('should get and set last deployment', function () {
            assert.strictEqual(getLastDeployment(), undefined)

            const mockClient: any = {}
            const mockDiffProvider: any = {}
            const deployment = new Deployment('test.yaml', 'test-stack', mockClient, mockDiffProvider)
            setLastDeployment(deployment)
            assert.strictEqual(getLastDeployment(), deployment)

            setLastDeployment(undefined)
            assert.strictEqual(getLastDeployment(), undefined)
        })
    })

    describe('diff view functionality', function () {
        it('should store and retrieve changes', function () {
            const mockClient: any = {}
            const mockDiffProvider: any = {}
            const deployment = new Deployment('test.yaml', 'test-stack', mockClient, mockDiffProvider)

            const testChanges: StackChange[] = [
                {
                    type: 'Resource',
                    resourceChange: {
                        action: 'Add',
                        logicalResourceId: 'TestResource',
                        resourceType: 'AWS::S3::Bucket',
                        replacement: 'False',
                    },
                },
            ]

            // Use protected method for testing
            ;(deployment as any).setChanges(testChanges)
            assert.deepStrictEqual(deployment.getChanges(), testChanges)
        })

        it('should have access to diff provider', function () {
            const mockClient: any = {}
            const mockDiffProvider = new DiffWebviewProvider()
            const deployment = new Deployment('test.yaml', 'test-stack', mockClient, mockDiffProvider)

            // Use protected method for testing
            const diffProvider = (deployment as any).getDiffProvider()
            assert.strictEqual(diffProvider, mockDiffProvider)
        })
    })
})
