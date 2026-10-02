import { beforeEach, describe, expect, it, vi } from 'vitest';
import { workspace } from 'vscode';
import { Logger, LoggerFactory } from '../../src/utils/Logger';

vi.mock('vscode');

function createChannel() {
    return {
        appendLine: vi.fn(),
        trace: vi.fn(),
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        dispose: vi.fn(),
    };
}

function configureLevel(level: string | undefined) {
    vi.mocked(workspace.getConfiguration).mockReturnValue({
        get: vi.fn().mockImplementation((_key: string, defaultValue: unknown) => level ?? defaultValue),
        update: vi.fn(),
        has: vi.fn(),
        inspect: vi.fn(),
    });
}

describe('Logger', () => {
    let channel: ReturnType<typeof createChannel>;

    beforeEach(() => {
        channel = createChannel();
        configureLevel(undefined);
    });

    it('writes through the channel method matching the level instead of appendLine', () => {
        const log = new Logger('Extension', channel as any);

        log.info('Activating v1.0.0');
        log.warn('slow start');
        log.error('boom');

        expect(channel.info).toHaveBeenCalledWith('[Extension] Activating v1.0.0');
        expect(channel.warn).toHaveBeenCalledWith('[Extension] slow start');
        expect(channel.error).toHaveBeenCalledWith('[Extension] boom');
        expect(channel.appendLine).not.toHaveBeenCalled();
    });

    it('does not add its own timestamp or level prefix', () => {
        const log = new Logger('Extension', channel as any);

        log.info('Activating v1.0.0');

        const [line] = channel.info.mock.calls[0];
        expect(line).toBe('[Extension] Activating v1.0.0');
        expect(line).not.toMatch(/\d{2}:\d{2}:\d{2}/);
        expect(line).not.toMatch(/Info:/);
    });

    it('emits the prefix once when both a message and data are given', () => {
        const log = new Logger('BaseLspInstaller', channel as any);
        const err = new Error('ENOENT');

        log.error(err, 'Download failed');

        const [line] = channel.error.mock.calls[0];
        expect(line.startsWith('[BaseLspInstaller] Download failed ')).toBe(true);
        expect(line.match(/\[BaseLspInstaller\]/g)).toHaveLength(1);
        expect(line).toContain('ENOENT');
    });

    it('honors the configured log level', () => {
        configureLevel('warn');
        const log = new Logger('Extension', channel as any);

        log.debug('d');
        log.info('i');
        log.warn('w');
        log.error('e');

        expect(channel.debug).not.toHaveBeenCalled();
        expect(channel.info).not.toHaveBeenCalled();
        expect(channel.warn).toHaveBeenCalledWith('[Extension] w');
        expect(channel.error).toHaveBeenCalledWith('[Extension] e');
    });

    it('emits debug through the channel debug method when configured', () => {
        configureLevel('debug');
        const log = new Logger('Extension', channel as any);

        log.debug('details');

        expect(channel.debug).toHaveBeenCalledWith('[Extension] details');
    });

    it('LoggerFactory returns one logger per name bound to the initialized channel', () => {
        LoggerFactory.reset();
        LoggerFactory.initialize(channel as any);

        const a = LoggerFactory.getLogger('A');
        const b = LoggerFactory.getLogger('A');
        a.info('hello');

        expect(a).toBe(b);
        expect(channel.info).toHaveBeenCalledWith('[A] hello');
    });
});
