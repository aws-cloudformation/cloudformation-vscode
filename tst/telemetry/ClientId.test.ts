import { describe, beforeEach, it, expect, vi } from 'vitest';
import { window } from 'vscode';
import { getClientId } from '../../src/telemetry/ClientId';
import { LoggerFactory } from '../../src/utils/Logger';

vi.mock('vscode');

describe('ClientId / telemetry', () => {
    let mockState: {
        data: Record<string, unknown>;
        get: (key: string) => unknown;
        update: (key: string, value: unknown) => Promise<void>;
    };

    beforeEach(() => {
        LoggerFactory.reset();
        LoggerFactory.initialize(window.createOutputChannel('test'));
        mockState = {
            data: {},
            get: function (key: string) {
                return this.data[key];
            },
            update: function (key: string, value: unknown): Promise<void> {
                this.data[key] = value;
                return Promise.resolve();
            },
        };
    });

    describe('getClientId', () => {
        it('returns undefined when telemetry is disabled', async () => {
            const result = await getClientId(mockState as any, false);

            expect(result).toBeUndefined();
        });

        it('generates and persists a UUID when telemetry is enabled and no cached id', async () => {
            const result = await getClientId(mockState as any, true);

            expect(result).toBeDefined();
            expect(result).toMatch(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i);
            // Persisted
            expect(mockState.data['aws.cloudformation.telemetryClientId']).toBe(result);
        });

        it('returns cached id on subsequent calls with telemetry enabled', async () => {
            const first = await getClientId(mockState as any, true);
            const second = await getClientId(mockState as any, true);

            expect(first).toBe(second);
        });

        it('does not clear persisted id when telemetry is disabled', async () => {
            // First enable and generate
            const id = await getClientId(mockState as any, true);
            expect(id).toBeDefined();

            // Then disable — should return undefined but NOT clear
            const result = await getClientId(mockState as any, false);
            expect(result).toBeUndefined();

            // Re-enable — should get the SAME id
            const restored = await getClientId(mockState as any, true);
            expect(restored).toBe(id);
        });
    });

    describe('initialization options', () => {
        it('omits clientId from initializationOptions when telemetry disabled', async () => {
            const clientId = await getClientId(mockState as any, false);

            // Simulate how extension.ts builds initializationOptions
            const initOptions = {
                aws: {
                    clientInfo: {
                        extension: { name: 'cloudformation-vscode', version: '1.0.0' },
                        ...(clientId ? { clientId } : {}),
                    },
                    telemetryEnabled: false,
                    encryption: { key: 'test', mode: 'JWT' },
                },
            };

            expect(initOptions.aws.clientInfo).not.toHaveProperty('clientId');
            expect(initOptions.aws.telemetryEnabled).toBe(false);
        });

        it('includes clientId in initializationOptions when telemetry enabled', async () => {
            const clientId = await getClientId(mockState as any, true);

            const initOptions = {
                aws: {
                    clientInfo: {
                        extension: { name: 'cloudformation-vscode', version: '1.0.0' },
                        ...(clientId ? { clientId } : {}),
                    },
                    telemetryEnabled: true,
                    encryption: { key: 'test', mode: 'JWT' },
                },
            };

            expect(initOptions.aws.clientInfo.clientId).toBe(clientId);
            expect(initOptions.aws.telemetryEnabled).toBe(true);
        });
    });
});
