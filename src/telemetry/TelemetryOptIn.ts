import { env, ExtensionContext, Memento, Uri, window, workspace } from 'vscode';
import { ExtensionConfigKey } from '../utils/ExtensionConfig';
import { LoggerFactory } from '../utils/Logger';

enum TelemetryChoice {
    Allow = 'Yes, Allow',
    Later = 'Not Now',
    Never = 'Never',
    LearnMore = 'Learn More',
}

const stateKeys = {
    hasResponded: `${ExtensionConfigKey}.telemetry.hasResponded`,
    lastPromptDate: `${ExtensionConfigKey}.telemetry.lastPromptDate`,
    unpersistedResponse: `${ExtensionConfigKey}.telemetry.unpersistedResponse`,
} as const;

const telemetrySettingKey = 'aws.cloudformation.telemetry';
const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
const promptTimeoutMs = 2500;
const telemetryDocsUrl = 'https://github.com/aws-cloudformation/cloudformation-languageserver/tree/main/src/telemetry';

function log() {
    return LoggerFactory.getLogger('TelemetryOptIn');
}

function readTelemetrySetting(): boolean {
    return workspace.getConfiguration(telemetrySettingKey).get<boolean>('enabled', false);
}

async function writeTelemetrySetting(value: boolean): Promise<boolean> {
    try {
        await workspace.getConfiguration(telemetrySettingKey).update('enabled', value, true);
        return true;
    } catch (error: unknown) {
        log().warn(error, `Failed to write telemetry setting`);
        return false;
    }
}

async function clearStateKey(globalState: Memento, key: string): Promise<void> {
    const empty: unknown = undefined;
    await globalState.update(key, empty);
}

export async function handleTelemetryOptIn(context: ExtensionContext): Promise<boolean> {
    const { globalState } = context;

    // 1. Recovery: if a previous choice failed to persist to settings, persist it now
    const unpersistedResponse = globalState.get<string>(stateKeys.unpersistedResponse);
    if (unpersistedResponse) {
        const didSave = await saveTelemetryResponse(unpersistedResponse);
        await clearStateKey(globalState, stateKeys.unpersistedResponse);

        if (!didSave) {
            log().warn('Telemetry choice could not be saved after restart, clearing state for next attempt');
            await clearStateKey(globalState, stateKeys.hasResponded);
            await clearStateKey(globalState, stateKeys.lastPromptDate);
        }

        const result = readTelemetrySetting();
        log().info(`Telemetry (recovered): ${result}`);
        return result;
    }

    // 2. If user has permanently responded, use their choice
    const hasResponded = globalState.get<boolean>(stateKeys.hasResponded);
    if (hasResponded) {
        const result = readTelemetrySetting();
        log().info(`Telemetry (previously responded): ${result}`);
        return result;
    }

    // 3. Check if we should show the prompt (30 days since last prompt)
    const lastPromptDate = globalState.get<number>(stateKeys.lastPromptDate);
    const shouldPrompt = lastPromptDate === undefined || Date.now() - lastPromptDate >= thirtyDaysMs;
    if (!shouldPrompt) {
        const result = readTelemetrySetting();
        log().info(`Telemetry (within 30-day window): ${result}`);
        return result;
    }

    // 5. Show prompt with timeout — return false if it doesn't resolve in time
    const promptPromise = promptTelemetryOptIn(context);
    const timeoutPromise = new Promise<false>((resolve) => setTimeout(() => resolve(false), promptTimeoutMs));
    const result = await Promise.race([promptPromise, timeoutPromise]);

    // Keep prompt alive in background so user can still respond
    void promptPromise;

    log().info(`Telemetry (result): ${result}`);
    return result;
}

async function saveTelemetryResponse(response: string | undefined): Promise<boolean> {
    if (response === TelemetryChoice.Allow) {
        return await writeTelemetrySetting(true);
    } else if (response === TelemetryChoice.Never || response === TelemetryChoice.Later) {
        return await writeTelemetrySetting(false);
    }
    return false;
}

async function promptTelemetryOptIn(context: ExtensionContext): Promise<boolean> {
    const { globalState } = context;

    const response = await window.showInformationMessage(
        'Help us improve the AWS CloudFormation Language Server by sharing anonymous telemetry data with AWS. You can change this preference at any time in aws.cloudformation Settings.',
        TelemetryChoice.Allow,
        TelemetryChoice.Later,
        TelemetryChoice.Never,
        TelemetryChoice.LearnMore,
    );

    if (response === TelemetryChoice.LearnMore) {
        await env.openExternal(Uri.parse(telemetryDocsUrl));
        return await promptTelemetryOptIn(context);
    }

    await globalState.update(stateKeys.lastPromptDate, Date.now());

    // Try to persist to VS Code settings; if settings aren't registered yet, save to globalState
    try {
        workspace.getConfiguration(telemetrySettingKey).get('enabled');
    } catch {
        log().warn('Telemetry setting not registered yet, saving to globalState for next restart');
        await globalState.update(stateKeys.unpersistedResponse, response);
        await globalState.update(stateKeys.hasResponded, response !== TelemetryChoice.Later);
        return response === TelemetryChoice.Allow;
    }

    await saveTelemetryResponse(response);
    await globalState.update(stateKeys.hasResponded, response !== TelemetryChoice.Later);
    return readTelemetrySetting();
}
