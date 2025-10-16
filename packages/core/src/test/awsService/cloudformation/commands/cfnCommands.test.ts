/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import {
    rerunLastValidationCommand,
    extractToParameterPositionCursorCommand,
} from '../../../../awsService/cloudformation/commands/cfnCommands'

describe('CfnCommands', function () {
    let sandbox: sinon.SinonSandbox
    let registerCommandStub: sinon.SinonStub

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        registerCommandStub = sandbox.stub(vscode.commands, 'registerCommand').returns({
            dispose: () => {},
        } as vscode.Disposable)
    })

    afterEach(function () {
        sandbox.restore()
    })

    describe('rerunLastValidationCommand', function () {
        it('should register rerun last validation command', function () {
            const result = rerunLastValidationCommand()
            assert.ok(result)
            assert.ok(registerCommandStub.calledOnce)
            assert.strictEqual(registerCommandStub.firstCall.args[0], 'aws.cloudformation.api.rerunLastValidation')
        })
    })

    describe('extractToParameterPositionCursorCommand', function () {
        it('should register extract to parameter command', function () {
            const result = extractToParameterPositionCursorCommand()
            assert.ok(result)
            assert.ok(registerCommandStub.calledOnce)
            assert.strictEqual(
                registerCommandStub.firstCall.args[0],
                'aws.cloudformation.extractToParameter.positionCursor'
            )
        })
    })
})
