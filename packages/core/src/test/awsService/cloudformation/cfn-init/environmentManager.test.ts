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
import { DeploymentFileSelector } from '../../../../awsService/cloudformation/ui/deploymentFileSelector'
import { OnStackFailure } from '@aws-sdk/client-cloudformation'

describe('EnvironmentManager', () => {
    let environmentManager: EnvironmentManager
    let mockAuth: sinon.SinonStubbedInstance<Auth>
    let mockWorkspaceState: any
    let mockEnvironmentSelector: sinon.SinonStubbedInstance<EnvironmentSelector>
    let mockParameterFileSelector: sinon.SinonStubbedInstance<DeploymentFileSelector>
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

        mockParameterFileSelector = {
            selectDeploymentFile: sinon.stub(),
        } as any

        fsStub = sinon.stub(fs, 'readFileText')
        workspaceStub = sinon.stub(workspace, 'workspaceFolders').value([{ uri: { fsPath: '/test/workspace' } }])

        environmentManager = new EnvironmentManager(mockEnvironmentSelector, mockParameterFileSelector)
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

    describe('selectDeploymentFile', () => {
        let readdirStub: sinon.SinonStub

        beforeEach(() => {
            readdirStub = sinon.stub(fs, 'readdir')
        })

        it('should return undefined when no environment selected', async () => {
            mockWorkspaceState.get.returns(undefined)

            const result = await environmentManager.selectDeploymentFile('template.yaml', [{ name: 'Param1' }])

            assert.strictEqual(result, undefined)
        })

        it('should collect all deployment files and pass to selector', async () => {
            mockWorkspaceState.get.returns('test-env')

            // Mock multiple files
            readdirStub.resolves([
                ['params1.json', 1],
                ['params2.yaml', 1],
                ['params3.yml', 1],
            ])

            // Mock file contents - params2.yaml has matching template path
            fsStub.onCall(0).resolves(
                JSON.stringify({
                    parameters: { Param1: 'value1' },
                    tags: { Tag1: 'value1' },
                    'on-stack-failure': OnStackFailure.DO_NOTHING,
                    'import-existing-resources': true,
                    'include-nested-stacks': false,
                })
            )
            fsStub.onCall(1).resolves('template-file-path: template.yaml\nparameters:\n  Param2: value2')
            fsStub.onCall(2).resolves('template-file-path: wrong-file.yaml\nparameters:\n  Param3: value3')

            // Mock workspace.asRelativePath to return matching path for template.yaml
            sinon.stub(workspace, 'asRelativePath').returns('template.yaml')

            const mockFileDetail = {
                fileName: 'selected.json',
                hasMatchingTemplatePath: true,
                compatibleParameters: [{ ParameterKey: 'Param1', ParameterValue: 'value1' }],
            }
            mockParameterFileSelector.selectDeploymentFile.resolves(mockFileDetail)

            const result = await environmentManager.selectDeploymentFile('template.yaml', [
                { name: 'Param1' },
                { name: 'Param2' },
                { name: 'Param3' },
            ])

            const [fileDetails, paramCount] = mockParameterFileSelector.selectDeploymentFile.getCall(0).args

            // Assert call arguments
            assert(mockParameterFileSelector.selectDeploymentFile.calledOnce)
            assert.strictEqual(fileDetails.length, 3)
            assert.strictEqual(paramCount, 3)

            // Check params1.json
            assert.strictEqual(fileDetails[0].fileName, 'params1.json')
            assert.strictEqual(fileDetails[0].hasMatchingTemplatePath, false)
            assert.deepStrictEqual(fileDetails[0].compatibleParameters, [
                { ParameterKey: 'Param1', ParameterValue: 'value1' },
            ])
            assert.deepStrictEqual(fileDetails[0].optionalFlags?.tags, [{ Key: 'Tag1', Value: 'value1' }])
            assert.deepStrictEqual(fileDetails[0].optionalFlags?.includeNestedStacks, false),
                assert.deepStrictEqual(fileDetails[0].optionalFlags?.importExistingResources, true),
                assert.deepStrictEqual(fileDetails[0].optionalFlags?.onStackFailure, OnStackFailure.DO_NOTHING),
                // Check params2.yaml
                assert.strictEqual(fileDetails[1].fileName, 'params2.yaml')
            assert.strictEqual(fileDetails[1].hasMatchingTemplatePath, true)
            assert.deepStrictEqual(fileDetails[1].compatibleParameters, [
                { ParameterKey: 'Param2', ParameterValue: 'value2' },
            ])

            // Check params3.yml
            assert.strictEqual(fileDetails[2].fileName, 'params3.yml')
            assert.strictEqual(fileDetails[2].hasMatchingTemplatePath, false)
            assert.deepStrictEqual(fileDetails[2].compatibleParameters, [
                { ParameterKey: 'Param3', ParameterValue: 'value3' },
            ])
            assert.strictEqual(result, mockFileDetail)
        })

        it('should exclude malformed files from selector options', async () => {
            mockWorkspaceState.get.returns('test-env')
            readdirStub.resolves([
                ['valid1.json', 1],
                ['null-object.json', 1],
                ['empty-object.json', 1],
                ['invalid-parameters.json', 1],
                ['invalid-template-path.json', 1],
                ['invalid-tags.json', 1],
                ['invalid-nested-stacks.json', 1],
                ['invalid-import-resources.json', 1],
                ['invalid-stack-failure.json', 1],
                ['no-deployment-file-properties.json', 1],
                ['valid2.yaml', 1],
            ])

            // Valid files
            fsStub.onCall(0).resolves(JSON.stringify({ parameters: { Param1: 'value1' } }))
            fsStub.onCall(10).resolves('parameters:\n  Param2: value2')

            // Malformed files for each validation case
            fsStub.onCall(1).resolves('null') // null object
            fsStub.onCall(2).resolves(JSON.stringify({})) // empty object
            fsStub.onCall(3).resolves(JSON.stringify({ parameters: { key: true } })) // non-string parameters
            fsStub.onCall(4).resolves(JSON.stringify({ 'template-file-path': 123 })) // non-string template path
            fsStub.onCall(5).resolves(JSON.stringify({ tags: { key: false } })) // non-string tags
            fsStub.onCall(6).resolves(JSON.stringify({ 'include-nested-stacks': 'yes' })) // non-boolean nested stacks
            fsStub.onCall(7).resolves(JSON.stringify({ 'import-existing-resources': 0 })) // non-boolean import resources
            fsStub.onCall(8).resolves(JSON.stringify({ 'on-stack-failure': 'INVALID_VALUE' })) // invalid stack failure value
            fsStub.onCall(9).resolves(JSON.stringify({ 'random-property': 'value' })) // file has no deployment file properties

            const mockFileDetail = { fileName: 'selected.json' }
            mockParameterFileSelector.selectDeploymentFile.resolves(mockFileDetail)

            await environmentManager.selectDeploymentFile('template.yaml', [{ name: 'Param1' }, { name: 'Param2' }])

            // Debug: Check what was actually called
            const [fileDetails, paramCount] = mockParameterFileSelector.selectDeploymentFile.getCall(0).args

            assert(mockParameterFileSelector.selectDeploymentFile.calledOnce)
            assert.strictEqual(fileDetails.length, 2)
            assert.strictEqual(paramCount, 2)

            // Check valid1.json
            assert.strictEqual(fileDetails[0].fileName, 'valid1.json')
            assert.strictEqual(fileDetails[0].hasMatchingTemplatePath, false)
            assert.deepStrictEqual(fileDetails[0].compatibleParameters, [
                { ParameterKey: 'Param1', ParameterValue: 'value1' },
            ])

            // Check valid2.yaml
            assert.strictEqual(fileDetails[1].fileName, 'valid2.yaml')
            assert.strictEqual(fileDetails[1].hasMatchingTemplatePath, false)
            assert.deepStrictEqual(fileDetails[1].compatibleParameters, [
                { ParameterKey: 'Param2', ParameterValue: 'value2' },
            ])
        })

        it('should return undefined when parameter file selector returns undefined', async () => {
            mockWorkspaceState.get.returns('test-env')
            const paramFile = { parameters: { Param1: 'value1' } }
            readdirStub.resolves([['params.json', 1]])
            fsStub.resolves(JSON.stringify(paramFile))

            mockParameterFileSelector.selectDeploymentFile.resolves(undefined)

            const result = await environmentManager.selectDeploymentFile('template.yaml', [{ name: 'Param1' }])

            assert.strictEqual(result, undefined)
        })
    })
})
