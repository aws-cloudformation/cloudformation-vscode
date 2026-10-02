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
        LoggerFactory.initialize(window.createOutputChannel('test', { log: true }));
        const data: Record<string, unknown> = {};
        mockState = {
            data,
            get: (key: string) => data[key],
            update: (key: string, value: unknown): Promise<void> => {
                data[key] = value;
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
});
