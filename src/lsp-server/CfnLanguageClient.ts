import { ExecuteCommandRequest } from 'vscode-languageclient';
import {
    DynamicFeature,
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    StaticFeature,
} from 'vscode-languageclient/node';
import { advertisedCommands } from './LspCommands';
import { suffixCodeActionCommands, SuffixedExecuteCommandFeature } from './SuffixedExecuteCommandFeature';

/** A `LanguageClient` that registers the server's command ids with VS Code under this client's suffix. */
export class CfnLanguageClient extends LanguageClient {
    constructor(id: string, name: string, serverOptions: ServerOptions, clientOptions: LanguageClientOptions) {
        super(id, name, serverOptions, clientOptions);
        this.middleware.provideCodeActions = async (document, range, context, token, next) => {
            const actions = await next(document, range, context, token);
            if (actions) {
                suffixCodeActionCommands(actions, advertisedCommands(this));
            }
            return actions;
        };
    }

    override registerFeature(feature: StaticFeature | DynamicFeature<unknown>): void {
        const replaced =
            'registrationType' in feature && feature.registrationType.method === ExecuteCommandRequest.method;
        super.registerFeature(replaced ? new SuffixedExecuteCommandFeature(this) : feature);
    }
}
