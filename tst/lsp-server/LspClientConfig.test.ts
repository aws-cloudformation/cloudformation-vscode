import { describe, it, expect } from 'vitest';
import { NodeModule, TransportKind } from 'vscode-languageclient/node';
import { CfnDocumentSelector, cfnInitializationOptions, cfnServerOptions } from '../../src/lsp-server/LspClientConfig';
import { CfnLspClientName, ExtensionVersion } from '../../src/utils/ExtensionConfig';

const serverPath = '/cache/aws/language-servers/cloudformation-languageserver/1.10.0/cfn-lsp-server-standalone.js';
const serverDirectory = '/cache/aws/language-servers/cloudformation-languageserver/1.10.0';

function launchModes() {
    const options = cfnServerOptions(serverPath) as { run: NodeModule; debug: NodeModule };
    return [options.run, options.debug];
}

describe('cfnServerOptions', () => {
    it('runs the server bundle from its own directory in both run and debug mode', () => {
        for (const mode of launchModes()) {
            expect(mode.options?.cwd).toBe(serverDirectory);
        }
    });

    it('launches the resolved bundle over IPC with source maps enabled in both modes', () => {
        for (const mode of launchModes()) {
            expect(mode.module).toBe(serverPath);
            expect(mode.transport).toBe(TransportKind.ipc);
            expect(mode.options?.env).toEqual({ NODE_OPTIONS: '--enable-source-maps' });
        }
    });

    it('disables lazy compilation only in debug mode', () => {
        const [run, debug] = launchModes();

        expect(run.options?.execArgv).toBeUndefined();
        expect(debug.options?.execArgv).toEqual(['--no-lazy']);
    });
});

describe('CfnDocumentSelector', () => {
    it('covers every file extension CloudFormation templates are commonly saved with', () => {
        const patterns = CfnDocumentSelector.map((filter) => ('pattern' in filter ? filter.pattern : undefined));

        for (const extension of ['yaml', 'yml', 'json', 'template', 'cfn', 'txt']) {
            expect(patterns).toContain(`**/*.${extension}`);
        }
    });

    it('only attaches to documents on disk', () => {
        expect(CfnDocumentSelector.every((filter) => 'scheme' in filter && filter.scheme === 'file')).toBe(true);
    });
});

describe('cfnInitializationOptions', () => {
    it('sends the per-client command suffix so the server suffixes every command id', () => {
        const options = cfnInitializationOptions(false, undefined);

        expect(CfnLspClientName).toBe('iac-vscode');
        expect(options.aws.commandSuffix).toBe(CfnLspClientName);
    });

    it('identifies the client and handles only file schemas', () => {
        const options = cfnInitializationOptions(true, 'client-id');

        expect(options.handledSchemaProtocols).toEqual(['file']);
        expect(options.aws.clientInfo.extension).toEqual({ name: 'iac-vscode', version: ExtensionVersion });
        expect(options.aws.telemetryEnabled).toBe(true);
    });

    it('forwards the client id when one is provided', () => {
        const options = cfnInitializationOptions(true, 'client-id');

        expect(options.aws.clientInfo.clientId).toBe('client-id');
    });

    it('leaves the client id off the wire when none is provided', () => {
        const options = cfnInitializationOptions(false, undefined);

        expect(JSON.stringify(options.aws.clientInfo)).not.toContain('clientId');
        expect(options.aws.telemetryEnabled).toBe(false);
    });

    it('sends one 256-bit JWT encryption key for the lifetime of the extension host', () => {
        const first = cfnInitializationOptions(false, undefined);
        const second = cfnInitializationOptions(true, 'client-id');

        expect(first.aws.encryption.mode).toBe('JWT');
        expect(Buffer.from(first.aws.encryption.key, 'base64')).toHaveLength(32);
        expect(second.aws.encryption.key).toBe(first.aws.encryption.key);
    });
});
