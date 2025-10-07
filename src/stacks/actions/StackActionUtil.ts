import { CreateStackActionParams } from './StackActionRequestType';
import { Parameter, Capability } from '@aws-sdk/client-cloudformation';

export function createStackActionParams(
    id: string,
    uri: string,
    stackName: string,
    parameters?: Parameter[],
    capabilities?: Capability[],
): CreateStackActionParams {
    return { id, uri, stackName, parameters, capabilities };
}
