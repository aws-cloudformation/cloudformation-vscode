import { randomUUID } from 'crypto';
import { Memento } from 'vscode';
import { commandKey } from '../utils/ExtensionConfig';
import { LoggerFactory } from '../utils/Logger';

const clientIdKey = commandKey('telemetryClientId');

export async function getClientId(globalState: Memento): Promise<string> {
    const log = LoggerFactory.getLogger('ClientId');
    const cached = globalState.get<string>(clientIdKey);
    if (cached) {
        log.debug(`Loaded from globalState: ${cached}`);
        return cached;
    }

    const id = randomUUID();
    await globalState.update(clientIdKey, id);
    log.info(`Generated clientId and persisted: ${id}`);
    return id;
}
