/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import { createDeploymentStatusBar, updateWorkflowStatus } from '../../../../awsService/cloudformation/ui/statusBar'
import { StackActionPhase } from '../../../../awsService/cloudformation/stacks/actions/stackActionRequestType'

describe('StatusBar', function () {
    let sandbox: sinon.SinonSandbox
    let clock: sinon.SinonFakeTimers

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        clock = sandbox.useFakeTimers()
    })

    afterEach(function () {
        sandbox.restore()
    })

    describe('createDeploymentStatusBar', function () {
        it('creates status bar handle', function () {
            const handle = createDeploymentStatusBar('stack1', 'Validation')

            assert.ok(handle)
            assert.strictEqual(typeof handle.update, 'function')
            assert.strictEqual(typeof handle.release, 'function')
        })

        it('creates handle for deployment with changeset', function () {
            const handle = createDeploymentStatusBar('stack1', 'Deployment', 'changeset1')

            assert.ok(handle)
        })
    })

    describe('updateWorkflowStatus', function () {
        it('updates handle with phase', function () {
            const handle = createDeploymentStatusBar('stack1', 'Validation')

            updateWorkflowStatus(handle, StackActionPhase.VALIDATION_IN_PROGRESS)
            updateWorkflowStatus(handle, StackActionPhase.VALIDATION_COMPLETE)

            handle.release()
        })

        it('handles terminal phases', function () {
            const handle = createDeploymentStatusBar('stack1', 'Validation')

            updateWorkflowStatus(handle, StackActionPhase.VALIDATION_COMPLETE)
            handle.release()

            clock.tick(5000)
        })

        it('handles multiple concurrent operations', function () {
            const handle1 = createDeploymentStatusBar('stack1', 'Validation')
            const handle2 = createDeploymentStatusBar('stack2', 'Deployment', 'changeset1')

            updateWorkflowStatus(handle1, StackActionPhase.VALIDATION_COMPLETE)
            updateWorkflowStatus(handle2, StackActionPhase.DEPLOYMENT_COMPLETE)

            handle1.release()
            handle2.release()

            clock.tick(5000)
        })

        it('handles failure phases', function () {
            const handle = createDeploymentStatusBar('stack1', 'Validation')

            updateWorkflowStatus(handle, StackActionPhase.VALIDATION_FAILED)
            handle.release()

            clock.tick(5000)
        })
    })
})
