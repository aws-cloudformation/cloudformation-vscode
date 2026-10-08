import { describe, it, expect } from 'vitest';
import { LanguageClient } from 'vscode-languageclient/node';
import {
    advertisedCommand,
    advertisedCommands,
    suffixedCommand,
    UpdateRegionCommand,
} from '../../src/lsp-server/LspCommands';

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
            '/command/template/clear-diagnostic.iac-vscode',
            '/command/region/update.iac-vscode',
        ]);

        expect(advertisedCommand(client, UpdateRegionCommand)).toBe('/command/region/update.iac-vscode');
    });

    it('resolves the unsuffixed id from a server that predates the command suffix', () => {
        const client = clientAdvertising(['/command/template/clear-diagnostic', '/command/region/update']);

        expect(advertisedCommand(client, UpdateRegionCommand)).toBe('/command/region/update');
    });

    it('never resolves a command registered under another client suffix', () => {
        const client = clientAdvertising(['/command/region/update.toolkit-vscode']);

        expect(() => advertisedCommand(client, UpdateRegionCommand)).toThrow(
            'Language server does not advertise /command/region/update.iac-vscode',
        );
    });

    it('throws when the server advertises no commands', () => {
        expect(() => advertisedCommand(clientAdvertising(undefined), UpdateRegionCommand)).toThrow(
            'Language server does not advertise /command/region/update.iac-vscode',
        );
    });

    it('throws before the client has initialized', () => {
        const client = {} as unknown as LanguageClient;

        expect(() => advertisedCommand(client, UpdateRegionCommand)).toThrow('does not advertise');
    });
});

describe('suffixedCommand', () => {
    it('appends the client suffix to an unsuffixed id', () => {
        expect(suffixedCommand(UpdateRegionCommand)).toBe('/command/region/update.iac-vscode');
    });

    it('keeps an id the server already suffixed for this client', () => {
        expect(suffixedCommand('/command/region/update.iac-vscode')).toBe('/command/region/update.iac-vscode');
    });

    it('suffixes an id carrying another client suffix rather than replacing it', () => {
        expect(suffixedCommand('/command/region/update.other')).toBe('/command/region/update.other.iac-vscode');
    });
});

describe('advertisedCommands', () => {
    it('returns the ids the server advertised', () => {
        expect(advertisedCommands(clientAdvertising(['/command/region/update']))).toEqual(['/command/region/update']);
    });

    it('returns no ids before initialization or when the server provides no commands', () => {
        expect(advertisedCommands({} as unknown as LanguageClient)).toEqual([]);
        expect(advertisedCommands(clientAdvertising(undefined))).toEqual([]);
    });
});
