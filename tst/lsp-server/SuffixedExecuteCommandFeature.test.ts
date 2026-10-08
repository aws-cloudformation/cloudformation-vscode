import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CodeAction, commands } from 'vscode';
import { ExecuteCommandRequest } from 'vscode-languageclient';
import { LanguageClient } from 'vscode-languageclient/node';
import {
    suffixCodeActionCommands,
    SuffixedExecuteCommandFeature,
} from '../../src/lsp-server/SuffixedExecuteCommandFeature';

vi.mock('vscode');
vi.mock('vscode-languageclient/node');
vi.mock('vscode-languageclient');

const ClearDiagnostic = '/command/template/clear-diagnostic';
const UpdateRegion = '/command/region/update';
const SuffixedClearDiagnostic = `${ClearDiagnostic}.iac-vscode`;
const SuffixedUpdateRegion = `${UpdateRegion}.iac-vscode`;

type CommandHandler = (...args: unknown[]) => Promise<unknown>;

function registeredCommands(): Map<string, CommandHandler> {
    return new Map(
        vi.mocked(commands.registerCommand).mock.calls.map(([id, handler]) => [id, handler as CommandHandler]),
    );
}

describe('SuffixedExecuteCommandFeature', () => {
    let client: { sendRequest: ReturnType<typeof vi.fn>; handleFailedRequest: ReturnType<typeof vi.fn> };
    let feature: SuffixedExecuteCommandFeature;

    beforeEach(() => {
        vi.mocked(commands.registerCommand)
            .mockReset()
            .mockImplementation(() => ({ dispose: vi.fn() }));
        client = {
            sendRequest: vi.fn().mockResolvedValue('result'),
            handleFailedRequest: vi.fn(),
        };
        feature = new SuffixedExecuteCommandFeature(client as unknown as LanguageClient);
    });

    it('registers for workspace/executeCommand and asks for dynamic registration', () => {
        const capabilities: { workspace?: { executeCommand?: { dynamicRegistration?: boolean } } } = {};

        feature.fillClientCapabilities(capabilities);

        expect(feature.registrationType).toBe(ExecuteCommandRequest.type);
        expect(capabilities.workspace?.executeCommand).toEqual({ dynamicRegistration: true });
        expect(feature.getState()).toEqual({ kind: 'workspace', id: 'workspace/executeCommand', registrations: false });
    });

    it('registers unsuffixed ids from a server that predates the command suffix under the suffixed id', () => {
        feature.initialize({ executeCommandProvider: { commands: [ClearDiagnostic, UpdateRegion] } });

        expect([...registeredCommands().keys()]).toEqual([SuffixedClearDiagnostic, SuffixedUpdateRegion]);
        expect(feature.getState()).toMatchObject({ registrations: true });
    });

    it('registers ids a server that honours the command suffix advertised as they are', () => {
        feature.initialize({ executeCommandProvider: { commands: [SuffixedClearDiagnostic, SuffixedUpdateRegion] } });

        expect([...registeredCommands().keys()]).toEqual([SuffixedClearDiagnostic, SuffixedUpdateRegion]);
    });

    it('registers nothing when the server provides no commands', () => {
        feature.initialize({});

        expect(commands.registerCommand).not.toHaveBeenCalled();
        expect(feature.getState()).toMatchObject({ registrations: false });
    });

    it('forwards an execution to the server under the id the server advertised', async () => {
        feature.initialize({ executeCommandProvider: { commands: [ClearDiagnostic] } });

        const result = await registeredCommands().get(SuffixedClearDiagnostic)?.('file:///t.yaml', { id: 1 });

        expect(result).toBe('result');
        expect(client.sendRequest).toHaveBeenCalledWith('workspace/executeCommand', {
            command: ClearDiagnostic,
            arguments: ['file:///t.yaml', { id: 1 }],
        });
    });

    it('hands a failed execution to the client', async () => {
        const error = new Error('boom');
        client.sendRequest.mockRejectedValue(error);
        client.handleFailedRequest.mockReturnValue('fallback');
        feature.initialize({ executeCommandProvider: { commands: [ClearDiagnostic] } });

        const result = await registeredCommands().get(SuffixedClearDiagnostic)?.();

        expect(result).toBe('fallback');
        expect(client.handleFailedRequest).toHaveBeenCalledWith(
            ExecuteCommandRequest.type,
            undefined,
            error,
            undefined,
        );
    });

    it('disposes the registrations of an id on unregister and all of them on clear', () => {
        feature.register({ id: 'first', registerOptions: { commands: [ClearDiagnostic] } });
        feature.register({ id: 'second', registerOptions: { commands: [UpdateRegion] } });
        const [first, second] = vi.mocked(commands.registerCommand).mock.results.map((result) => result.value);

        feature.unregister('first');

        expect(first.dispose).toHaveBeenCalledTimes(1);
        expect(second.dispose).not.toHaveBeenCalled();
        expect(feature.getState()).toMatchObject({ registrations: true });

        feature.clear();

        expect(second.dispose).toHaveBeenCalledTimes(1);
        expect(feature.getState()).toMatchObject({ registrations: false });
    });
});

describe('suffixCodeActionCommands', () => {
    const advertised = [ClearDiagnostic, UpdateRegion];

    it('points code actions at the suffixed id of an advertised command', () => {
        const action = { title: 'Remove', command: { title: 'Remove', command: ClearDiagnostic, arguments: ['u'] } };

        suffixCodeActionCommands([action], advertised);

        expect(action.command).toEqual({ title: 'Remove', command: SuffixedClearDiagnostic, arguments: ['u'] });
    });

    it('rewrites a bare command item', () => {
        const command = { title: 'Update', command: UpdateRegion };

        suffixCodeActionCommands([command], advertised);

        expect(command.command).toBe(SuffixedUpdateRegion);
    });

    it('leaves commands the server did not advertise and actions without a command alone', () => {
        const own = { title: 'Extract', command: { title: 'Extract', command: 'aws.cloudformation.extract' } };
        const editOnly = { title: 'Fix', edit: {} };

        suffixCodeActionCommands([own, editOnly as CodeAction], advertised);

        expect(own.command.command).toBe('aws.cloudformation.extract');
        expect(editOnly).toEqual({ title: 'Fix', edit: {} });
    });

    it('is a no-op for a server that already suffixes its commands', () => {
        const action = { title: 'Remove', command: { title: 'Remove', command: SuffixedClearDiagnostic } };

        suffixCodeActionCommands([action], [SuffixedClearDiagnostic, SuffixedUpdateRegion]);

        expect(action.command.command).toBe(SuffixedClearDiagnostic);
    });
});
