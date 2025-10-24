/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { strict as assert } from 'assert'
import * as sinon from 'sinon'
import { EnvironmentManager } from '../../../../awsService/cloudformation/cfn-init/environmentManager'
import { Auth } from '../../../../auth/auth'
import { globals } from '../../../../shared'
import { workspace } from 'vscode'
import fs from '../../../../shared/fs/fs'
import { EnvironmentSelector } from '../../../../awsService/cloudformation/ui/environmentSelector'

describe('EnvironmentManager', () => {
    let environmentManager: EnvironmentManager
    let mockAuth: sinon.SinonStubbedInstance<Auth>
    let mockWorkspaceState: any
    let mockEnvironmentSelector: sinon.SinonStubbedInstance<EnvironmentSelector>
    let fsStub: sinon.SinonStub
    let workspaceStub: sinon.SinonStub

    beforeEach(() => {
        mockAuth = {
            getConnection: sinon.stub(),
            useConnection: sinon.stub(),
            activeConnection: {
                id: 'profile:test-profile',
                type: 'iam',
                label: 'test-profile',
                state: 'valid',
            } as any,
        } as any

        sinon.stub(Auth, 'instance').get(() => mockAuth)

        mockWorkspaceState = {
            get: sinon.stub(),
            update: sinon.stub(),
        }
        sinon.stub(globals, 'context').value({ workspaceState: mockWorkspaceState })

        mockEnvironmentSelector = {
            selectEnvironment: sinon.stub(),
        } as any

        fsStub = sinon.stub(fs, 'readFileText')
        workspaceStub = sinon.stub(workspace, 'workspaceFolders').value([{ uri: { fsPath: '/test/workspace' } }])

        environmentManager = new EnvironmentManager(mockEnvironmentSelector)
    })

    afterEach(() => {
        sinon.restore()
    })

    describe('getSelectedEnvironmentName', () => {
        it('should return selected environment from workspace state', () => {
            mockWorkspaceState.get.returns('test-env')

            const result = environmentManager.getSelectedEnvironmentName()

            assert.strictEqual(result, 'test-env')
            assert(mockWorkspaceState.get.calledWith('aws.cloudformation.selectedEnvironment'))
        })
    })

    describe('selectEnvironment', () => {
        it('should select environment successfully', async () => {
            const mockEnvironmentLookup = { 'test-env': { name: 'test-env', profile: 'test-profile' } }
            fsStub.resolves(JSON.stringify({ environments: mockEnvironmentLookup }))
            mockEnvironmentSelector.selectEnvironment.resolves('test-env')

            const mockConnection = {
                id: 'profile:test-profile',
                type: 'iam',
                label: 'test-profile',
                state: 'valid',
            } as any
            mockAuth.getConnection.resolves(mockConnection)

            const listener = sinon.stub()
            environmentManager.addListener(listener)

            await environmentManager.selectEnvironment()

            assert(mockEnvironmentSelector.selectEnvironment.calledWith(mockEnvironmentLookup))
            assert(mockWorkspaceState.update.calledWith('aws.cloudformation.selectedEnvironment', 'test-env'))
            assert(mockAuth.getConnection.calledWith({ id: 'profile:test-profile' }))
            assert(mockAuth.useConnection.calledWith(mockConnection))
            assert(listener.called)
        })

        it('should handle fetch error gracefully', async () => {
            fsStub.rejects(new Error('File not found'))

            await environmentManager.selectEnvironment()

            assert(mockEnvironmentSelector.selectEnvironment.notCalled)
        })

        it('should handle no environment selected', async () => {
            const mockEnvironmentLookup = { 'test-env': { name: 'test-env', profile: 'test-profile' } }
            fsStub.resolves(JSON.stringify({ environments: mockEnvironmentLookup }))
            mockEnvironmentSelector.selectEnvironment.resolves(undefined)

            await environmentManager.selectEnvironment()

            assert(mockWorkspaceState.update.notCalled)
            assert(mockAuth.getConnection.notCalled)
        })

        it('should handle missing connection gracefully', async () => {
            const mockEnvironmentLookup = { 'test-env': { name: 'test-env', profile: 'missing-profile' } }
            fsStub.resolves(JSON.stringify({ environments: mockEnvironmentLookup }))
            mockEnvironmentSelector.selectEnvironment.resolves('test-env')
            mockAuth.getConnection.resolves(undefined)

            await environmentManager.selectEnvironment()

            assert(mockWorkspaceState.update.calledWith('aws.cloudformation.selectedEnvironment', 'test-env'))
            assert(mockAuth.useConnection.notCalled)
        })
    })

    describe('fetchAvailableEnvironments', () => {
        it('should fetch environments successfully', async () => {
            const mockEnvironmentLookup = { env1: { name: 'env1', profile: 'profile1' } }
            fsStub.resolves(JSON.stringify({ environments: mockEnvironmentLookup }))

            const result = await environmentManager.fetchAvailableEnvironments()

            assert.deepStrictEqual(result, mockEnvironmentLookup)
        })

        it('should throw error when workspace not found', async () => {
            workspaceStub.value(undefined)

            await assert.rejects(environmentManager.fetchAvailableEnvironments(), /No workspace folder found/)
        })

        it('should throw error when file read fails', async () => {
            fsStub.rejects(new Error('File not found'))

            await assert.rejects(environmentManager.fetchAvailableEnvironments(), /File not found/)
        })
    })
})
