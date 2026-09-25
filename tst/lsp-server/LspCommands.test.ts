import { describe, it, expect } from 'vitest';
import { LanguageClient } from 'vscode-languageclient/node';
import { advertisedCommand, UpdateRegionCommand } from '../../src/lsp-server/LspCommands';

function clientAdvertising(commands: string[] | undefined): LanguageClient {
    return {
        initializeResult: {
            capabilities: commands ? { executeCommandProvider: { commands } } : {},
        },
    } as unknown as LanguageClient;
}

describe('advertisedCommand', () => {
    it('resolves the suffixed id when the server honours the command suffix', () => {
        const client = clientAdvertising([
            '/command/template/clear-diagnostic.cloudformation-vscode',
            '/command/region/update.cloudformation-vscode',
        ]);

        expect(advertisedCommand(client, UpdateRegionCommand)).toBe('/command/region/update.cloudformation-vscode');
    });

    it('resolves the unsuffixed id from a server that predates the command suffix', () => {
        const client = clientAdvertising(['/command/template/clear-diagnostic', '/command/region/update']);

        expect(advertisedCommand(client, UpdateRegionCommand)).toBe('/command/region/update');
    });

    it('never resolves a command registered under another client suffix', () => {
        const client = clientAdvertising(['/command/region/update.toolkit-vscode']);

        expect(() => advertisedCommand(client, UpdateRegionCommand)).toThrow(
            'Language server does not advertise /command/region/update.cloudformation-vscode',
        );
    });

    it('throws when the server advertises no commands', () => {
        expect(() => advertisedCommand(clientAdvertising(undefined), UpdateRegionCommand)).toThrow(
            'Language server does not advertise /command/region/update.cloudformation-vscode',
        );
    });

    it('throws before the client has initialized', () => {
        const client = {} as unknown as LanguageClient;

        expect(() => advertisedCommand(client, UpdateRegionCommand)).toThrow('does not advertise');
    });
});
