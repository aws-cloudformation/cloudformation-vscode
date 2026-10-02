import { beforeEach, describe, expect, it, vi } from 'vitest';
import { window, workspace } from 'vscode';
import { handleTelemetryOptIn } from '../../src/telemetry/TelemetryOptIn';
import { LoggerFactory } from '../../src/utils/Logger';

vi.mock('vscode');

const settingKey = 'aws.iac.telemetry';

function createContext(state: Record<string, unknown>) {
    return {
        globalState: {
            get: (key: string) => state[key],
            update: (key: string, value: unknown) => {
                state[key] = value;
                return Promise.resolve();
            },
        },
    } as any;
}

describe('handleTelemetryOptIn', () => {
    let settings: Record<string, Record<string, unknown>>;

    beforeEach(() => {
        LoggerFactory.reset();
        LoggerFactory.initialize(window.createOutputChannel('test', { log: true }));

        settings = {};
        vi.mocked(workspace.getConfiguration).mockImplementation((section?: string) => {
            const values = (settings[section ?? ''] ??= {});
            return {
                get: vi.fn((key: string, defaultValue?: unknown) => values[key] ?? defaultValue),
                update: vi.fn((key: string, value: unknown) => {
                    values[key] = value;
                    return Promise.resolve();
                }),
                has: vi.fn(),
                inspect: vi.fn(),
            };
        });
    });

    it('reads a previously recorded choice from aws.iac.telemetry.enabled', async () => {
        settings[settingKey] = { enabled: true };
        const context = createContext({ 'aws.cloudformation.telemetry.hasResponded': true });

        await expect(handleTelemetryOptIn(context)).resolves.toBe(true);
    });

    it('ignores aws.cloudformation.telemetry.enabled contributed by other extensions', async () => {
        settings['aws.cloudformation.telemetry'] = { enabled: true };
        const context = createContext({ 'aws.cloudformation.telemetry.hasResponded': true });

        await expect(handleTelemetryOptIn(context)).resolves.toBe(false);
    });

    it('persists the prompt answer under aws.iac.telemetry.enabled only', async () => {
        vi.mocked(window.showInformationMessage).mockResolvedValue('Yes, Allow' as any);
        const state: Record<string, unknown> = {};

        await expect(handleTelemetryOptIn(createContext(state))).resolves.toBe(true);

        expect(settings[settingKey]).toEqual({ enabled: true });
        expect(settings['aws.cloudformation.telemetry']?.enabled).toBeUndefined();
        expect(state['aws.cloudformation.telemetry.hasResponded']).toBe(true);
    });
});
