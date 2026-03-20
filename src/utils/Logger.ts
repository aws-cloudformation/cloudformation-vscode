import { OutputChannel, workspace } from 'vscode';
import { toString } from './Utils';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const levelPriority: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

function formatTime(): string {
    return new Date().toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
    });
}

export class Logger {
    private readonly configuredLevel = workspace
        .getConfiguration('aws.cloudformation.telemetry')
        .get<LogLevel>('logLevel', 'info');

    constructor(
        private readonly name: string,
        private readonly channel: OutputChannel,
    ) {}

    private shouldLog(level: LogLevel): boolean {
        return levelPriority[level] >= levelPriority[this.configuredLevel];
    }

    private write(level: LogLevel, data: unknown, message?: string): void {
        if (!this.shouldLog(level)) {
            return;
        }

        let line = `[${formatTime()}] ${capitalize(level)}: [${this.name}]`;
        if (message) {
            line += `${line} ${message}`;
        }

        if (data) {
            line += ` ${toString(data)}`;
        }
        this.channel.appendLine(line);
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
    private static channel: OutputChannel;
    private static readonly loggers = new Map<string, Logger>();

    static initialize(channel: OutputChannel) {
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
        this.channel = undefined as unknown as OutputChannel;
        this.loggers.clear();
    }
}

function capitalize(str: string) {
    return str
        .split(' ')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}
