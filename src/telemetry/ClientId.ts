import { randomUUID } from 'crypto';
import { Memento } from 'vscode';
import { commandKey } from '../utils/ExtensionConfig';
import { LoggerFactory } from '../utils/Logger';

const clientIdKey = commandKey('telemetryClientId');

/**
 * Returns the persisted telemetry clientId, generating one on first use.
 *
 * When telemetry is not enabled, no clientId is forwarded (the server decides how to
 * handle the absence). Any previously persisted id is kept so the same id is reused
 * if the user opts back in.
 */
export async function getClientId(globalState: Memento, telemetryEnabled: boolean): Promise<string | undefined> {
    const log = LoggerFactory.getLogger('ClientId');

    if (!telemetryEnabled) {
        log.debug('Telemetry disabled, not forwarding a clientId');
        return undefined;
    }

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
