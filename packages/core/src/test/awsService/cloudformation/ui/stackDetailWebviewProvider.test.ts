/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import { StackDetailWebviewProvider } from '../../../../awsService/cloudformation/ui/stackDetailWebviewProvider'

describe('StackDetailWebviewProvider', function () {
    let sandbox: sinon.SinonSandbox
    let provider: StackDetailWebviewProvider
    let mockClient: any

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        mockClient = {
            sendRequest: sandbox.stub(),
        }
        provider = new StackDetailWebviewProvider(mockClient)
    })

    afterEach(function () {
        sandbox.restore()
    })

    function createMockWebview() {
        return {
            webview: {
                options: {},
                html: '',
                onDidReceiveMessage: sandbox.stub(),
            },
            onDidChangeVisibility: sandbox.stub(),
            onDidDispose: sandbox.stub(),
            visible: true,
        }
    }

    describe('updateData', function () {
        it('should update stack name and fetch resources', async function () {
            const mockResources = [
                {
                    LogicalResourceId: 'TestBucket',
                    PhysicalResourceId: 'test-bucket-123',
                    ResourceType: 'AWS::S3::Bucket',
                    ResourceStatus: 'CREATE_COMPLETE',
                },
            ]

            mockClient.sendRequest.resolves({ resources: mockResources })

            const mockWebview = createMockWebview()
            provider.resolveWebviewView(mockWebview as any)

            await provider.updateData('test-stack')

            assert.ok(mockClient.sendRequest.calledOnce)
            const [, params] = mockClient.sendRequest.firstCall.args
            assert.strictEqual(params.stackName, 'test-stack')
        })

        it('should handle client request errors gracefully', async function () {
            mockClient.sendRequest.rejects(new Error('Network error'))

            const mockWebview = createMockWebview()
            provider.resolveWebviewView(mockWebview as any)

            // Should not throw
            await provider.updateData('test-stack')
        })
    })

    describe('resolveWebviewView', function () {
        it('should configure webview options and set HTML content', function () {
            const mockWebview = createMockWebview()

            provider.resolveWebviewView(mockWebview as any)

            assert.deepStrictEqual(mockWebview.webview.options, { enableScripts: true })
            assert.ok(mockWebview.webview.html.length > 0)
        })

        it('should set up visibility change handlers', function () {
            const mockWebview = createMockWebview()

            provider.resolveWebviewView(mockWebview as any)

            assert.ok(mockWebview.onDidChangeVisibility.calledOnce)
            assert.ok(mockWebview.onDidDispose.calledOnce)
        })

        it('should set up message handlers for pagination', function () {
            const mockWebview = createMockWebview()

            provider.resolveWebviewView(mockWebview as any)

            assert.ok(mockWebview.webview.onDidReceiveMessage.calledOnce)
        })
    })

    describe('HTML generation', function () {
        it('should show no resources message when empty', async function () {
            mockClient.sendRequest.resolves({ resources: [] })

            const mockWebview = createMockWebview()
            provider.resolveWebviewView(mockWebview as any)

            await provider.updateData('test-stack')

            assert.ok(mockWebview.webview.html.includes('No resources found for stack: test-stack'))
        })

        it('should generate table with resources', async function () {
            const mockResources = [
                {
                    LogicalResourceId: 'TestBucket',
                    PhysicalResourceId: 'test-bucket-123',
                    ResourceType: 'AWS::S3::Bucket',
                    ResourceStatus: 'CREATE_COMPLETE',
                },
            ]

            mockClient.sendRequest.resolves({ resources: mockResources })

            const mockWebview = createMockWebview()
            provider.resolveWebviewView(mockWebview as any)

            await provider.updateData('test-stack')

            const html = mockWebview.webview.html

            // Verify table headers
            assert.ok(html.includes('Logical ID'))
            assert.ok(html.includes('Physical ID'))
            assert.ok(html.includes('Type'))
            assert.ok(html.includes('Status'))

            // Verify row data
            assert.ok(html.includes('TestBucket'))
            assert.ok(html.includes('test-bucket-123'))
            assert.ok(html.includes('AWS::S3::Bucket'))
            assert.ok(html.includes('CREATE_COMPLETE'))
        })

        it('should handle resources without physical ID', async function () {
            const mockResources = [
                {
                    LogicalResourceId: 'TestResource',
                    ResourceType: 'AWS::CloudFormation::WaitConditionHandle',
                    ResourceStatus: 'CREATE_COMPLETE',
                },
            ]

            mockClient.sendRequest.resolves({ resources: mockResources })

            const mockWebview = createMockWebview()
            provider.resolveWebviewView(mockWebview as any)

            await provider.updateData('test-stack')

            const html = mockWebview.webview.html

            assert.ok(html.includes('TestResource'))
            assert.ok(html.includes('AWS::CloudFormation::WaitConditionHandle'))
            assert.ok(html.includes('CREATE_COMPLETE'))
        })

        it('should not show pagination controls when there is only one page', async function () {
            const mockResources = Array.from({ length: 10 }, (_, i) => ({
                LogicalResourceId: `Resource${i}`,
                ResourceType: 'AWS::S3::Bucket',
                ResourceStatus: 'CREATE_COMPLETE',
            }))

            mockClient.sendRequest.resolves({ resources: mockResources })

            const mockWebview = createMockWebview()
            provider.resolveWebviewView(mockWebview as any)

            await provider.updateData('test-stack')

            const html = mockWebview.webview.html

            // Should not show pagination buttons for single page
            assert.ok(!html.includes('Previous'))
            assert.ok(!html.includes('Next'))
        })

        it('should show pagination controls when there are multiple pages', async function () {
            const mockResources = Array.from({ length: 60 }, (_, i) => ({
                LogicalResourceId: `Resource${i}`,
                ResourceType: 'AWS::S3::Bucket',
                ResourceStatus: 'CREATE_COMPLETE',
            }))

            mockClient.sendRequest.resolves({ resources: mockResources })

            const mockWebview = createMockWebview()
            provider.resolveWebviewView(mockWebview as any)

            await provider.updateData('test-stack')

            const html = mockWebview.webview.html

            // Should show pagination buttons for multiple pages
            assert.ok(html.includes('Previous'))
            assert.ok(html.includes('Next'))
        })

        it('should disable Previous button on first page', async function () {
            const mockResources = Array.from({ length: 60 }, (_, i) => ({
                LogicalResourceId: `Resource${i}`,
                ResourceType: 'AWS::S3::Bucket',
                ResourceStatus: 'CREATE_COMPLETE',
            }))

            mockClient.sendRequest.resolves({ resources: mockResources })

            const mockWebview = createMockWebview()
            provider.resolveWebviewView(mockWebview as any)

            await provider.updateData('test-stack')

            const html = mockWebview.webview.html

            // Previous button should be disabled on first page
            assert.ok(html.includes('disabled'))
            assert.ok(html.includes('Previous'))
        })
    })

    describe('pagination functionality', function () {
        let clock: sinon.SinonFakeTimers

        beforeEach(function () {
            clock = sandbox.useFakeTimers()
        })

        afterEach(function () {
            clock.restore()
        })

        it('should handle nextPage message', async function () {
            const mockResources = Array.from({ length: 60 }, (_, i) => ({
                LogicalResourceId: `Resource${i}`,
                ResourceType: 'AWS::S3::Bucket',
                ResourceStatus: 'CREATE_COMPLETE',
            }))

            mockClient.sendRequest.resolves({ resources: mockResources })

            const mockWebview = createMockWebview()
            provider.resolveWebviewView(mockWebview as any)

            await provider.updateData('test-stack')

            // Simulate nextPage message
            const messageHandler = mockWebview.webview.onDidReceiveMessage.firstCall.args[0]
            await messageHandler({ command: 'nextPage' })

            // Should update the HTML after page change
            assert.ok(mockWebview.webview.html.length > 0)
        })

        it('should handle prevPage message', async function () {
            const mockResources = Array.from({ length: 60 }, (_, i) => ({
                LogicalResourceId: `Resource${i}`,
                ResourceType: 'AWS::S3::Bucket',
                ResourceStatus: 'CREATE_COMPLETE',
            }))

            mockClient.sendRequest.resolves({ resources: mockResources })

            const mockWebview = createMockWebview()
            provider.resolveWebviewView(mockWebview as any)

            await provider.updateData('test-stack')

            // Simulate prevPage message
            const messageHandler = mockWebview.webview.onDidReceiveMessage.firstCall.args[0]
            await messageHandler({ command: 'prevPage' })

            // Should update the HTML after page change
            assert.ok(mockWebview.webview.html.length > 0)
        })

        it('should start auto-update when webview becomes visible', async function () {
            mockClient.sendRequest.resolves({ resources: [] })

            const mockWebview = createMockWebview()
            provider.resolveWebviewView(mockWebview as any)

            await provider.updateData('test-stack')

            // Simulate visibility change to visible
            const visibilityHandler = mockWebview.onDidChangeVisibility.firstCall.args[0]
            mockWebview.visible = true
            visibilityHandler()

            // Fast-forward time to trigger auto-update
            clock.tick(5000)

            // Should have made additional requests due to auto-update
            assert.ok(mockClient.sendRequest.callCount >= 2)
        })

        it('should stop auto-update when webview becomes hidden', async function () {
            mockClient.sendRequest.resolves({ resources: [] })

            const mockWebview = createMockWebview()
            provider.resolveWebviewView(mockWebview as any)

            await provider.updateData('test-stack')

            // Start auto-update
            const visibilityHandler = mockWebview.onDidChangeVisibility.firstCall.args[0]
            mockWebview.visible = true
            visibilityHandler()

            // Stop auto-update
            mockWebview.visible = false
            visibilityHandler()

            const callCountAfterStop = mockClient.sendRequest.callCount

            // Fast-forward time
            clock.tick(10000)

            // Should not have made additional requests
            assert.strictEqual(mockClient.sendRequest.callCount, callCountAfterStop)
        })
    })

    describe('loadResources', function () {
        it('should handle nextToken for pagination', async function () {
            const firstBatch = Array.from({ length: 50 }, (_, i) => ({
                LogicalResourceId: `Resource${i}`,
                ResourceType: 'AWS::S3::Bucket',
                ResourceStatus: 'CREATE_COMPLETE',
            }))

            const secondBatch = Array.from({ length: 10 }, (_, i) => ({
                LogicalResourceId: `Resource${i + 50}`,
                ResourceType: 'AWS::S3::Bucket',
                ResourceStatus: 'CREATE_COMPLETE',
            }))

            mockClient.sendRequest
                .onFirstCall()
                .resolves({ resources: firstBatch, nextToken: 'token123' })
                .onSecondCall()
                .resolves({ resources: secondBatch })

            const mockWebview = createMockWebview()
            provider.resolveWebviewView(mockWebview as any)

            await provider.updateData('test-stack')

            // Simulate nextPage to load more resources
            const messageHandler = mockWebview.webview.onDidReceiveMessage.firstCall.args[0]
            await messageHandler({ command: 'nextPage' })

            // Should have made two requests
            assert.strictEqual(mockClient.sendRequest.callCount, 2)
        })

        it('should return early if no client or stack name', async function () {
            const providerWithoutClient = new StackDetailWebviewProvider(undefined as any)
            const mockWebview = createMockWebview()
            providerWithoutClient.resolveWebviewView(mockWebview as any)

            // Should not throw
            await providerWithoutClient.updateData('')
        })
    })
})
