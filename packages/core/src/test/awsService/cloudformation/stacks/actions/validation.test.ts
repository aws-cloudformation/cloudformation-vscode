/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import {
    Validation,
    getLastValidation,
    setLastValidation,
} from '../../../../../awsService/cloudformation/stacks/actions/validationWorkflow'
import { DiffWebviewProvider } from '../../../../../awsService/cloudformation/ui/diffWebviewProvider'
import { StackChange } from '../../../../../awsService/cloudformation/stacks/actions/stackActionRequestType'
import { Parameter, Capability } from '@aws-sdk/client-cloudformation'

describe('Validation', function () {
    let sandbox: sinon.SinonSandbox

    beforeEach(function () {
        sandbox = sinon.createSandbox()
    })

    afterEach(function () {
        sandbox.restore()
    })

    describe('last validation tracking', function () {
        it('should get and set last validation', function () {
            assert.strictEqual(getLastValidation(), undefined)

            const mockClient: any = {}
            const mockDiffProvider: any = {}
            const validation = new Validation('test.yaml', 'test-stack', mockClient, mockDiffProvider)
            setLastValidation(validation)
            assert.strictEqual(getLastValidation(), validation)

            setLastValidation(undefined)
            assert.strictEqual(getLastValidation(), undefined)
        })
    })

    describe('Validation class', function () {
        it('should initialize with required properties', function () {
            const mockClient: any = {}
            const mockDiffProvider = new DiffWebviewProvider()
            const validation = new Validation('test.yaml', 'test-stack', mockClient, mockDiffProvider)

            assert.strictEqual(validation.uri, 'test.yaml')
            assert.strictEqual(validation.stackName, 'test-stack')
            assert.strictEqual(validation.parameters, undefined)
        })

        it('should initialize with optional parameters and capabilities', function () {
            const mockClient: any = {}
            const mockDiffProvider = new DiffWebviewProvider()
            const parameters: Parameter[] = [{ ParameterKey: 'key1', ParameterValue: 'value1' }]
            const capabilities: Capability[] = ['CAPABILITY_IAM']

            const validation = new Validation(
                'test.yaml',
                'test-stack',
                mockClient,
                mockDiffProvider,
                parameters,
                capabilities
            )

            assert.strictEqual(validation.uri, 'test.yaml')
            assert.strictEqual(validation.stackName, 'test-stack')
            assert.deepStrictEqual(validation.parameters, parameters)
        })

        it('should store and retrieve changes', function () {
            const mockClient: any = {}
            const mockDiffProvider: any = {}
            const validation = new Validation('test.yaml', 'test-stack', mockClient, mockDiffProvider)

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

            ;(validation as any).setChanges(testChanges)
            assert.deepStrictEqual(validation.getChanges(), testChanges)
        })

        it('should have access to diff provider', function () {
            const mockClient: any = {}
            const mockDiffProvider = new DiffWebviewProvider()
            const validation = new Validation('test.yaml', 'test-stack', mockClient, mockDiffProvider)

            const diffProvider = (validation as any).getDiffProvider()
            assert.strictEqual(diffProvider, mockDiffProvider)
        })

        it('should return undefined changes initially', function () {
            const mockClient: any = {}
            const mockDiffProvider: any = {}
            const validation = new Validation('test.yaml', 'test-stack', mockClient, mockDiffProvider)

            assert.strictEqual(validation.getChanges(), undefined)
        })
    })
})
