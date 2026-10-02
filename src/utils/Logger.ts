import { LogOutputChannel, workspace } from 'vscode';
import { extractErrorMessage, toString } from './Utils';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const levelPriority: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

export class Logger {
    private readonly configuredLevel = workspace
        .getConfiguration('aws.cloudformation.telemetry')
        .get<LogLevel>('logLevel', 'info');

    constructor(
        private readonly name: string,
        private readonly channel: LogOutputChannel,
    ) {}

    private shouldLog(level: LogLevel): boolean {
        return levelPriority[level] >= levelPriority[this.configuredLevel];
    }

    private write(level: LogLevel, data: unknown, message?: string): void {
        if (!this.shouldLog(level)) {
            return;
        }

        // The channel stamps time and level itself; only the component name is added here.
        let line = `[${this.name}]`;
        if (message) {
            line += ` ${message}`;
        }

        if (data) {
            line += ` ${data instanceof Error ? (data.stack ?? extractErrorMessage(data)) : toString(data)}`;
        }
        this.channel[level](line);
    }

    debug(data: unknown, message?: string): void {
        this.write('debug', data, message);
    }

    info(data: unknown, message?: string): void {
        this.write('info', data, message);
    }

    warn(data: unknown, message?: string): void {
        this.write('warn', data, message);
    }

    error(data: unknown, message?: string): void {
        this.write('error', data, message);
    }
}

export class LoggerFactory {
    private static channel: LogOutputChannel;
    private static readonly loggers = new Map<string, Logger>();

    static initialize(channel: LogOutputChannel) {
        this.channel = channel;
    }

    static getLogger(name: string): Logger {
        if (!this.channel) {
            throw new Error('LoggerFactory not initialized');
        }

        let logger = this.loggers.get(name);
        if (!logger) {
            logger = new Logger(name, this.channel);
            this.loggers.set(name, logger);
        }
        return logger;
    }

    /** @internal For testing only */
    static reset(): void {
        this.channel = undefined as unknown as LogOutputChannel;
        this.loggers.clear();
    }
}
