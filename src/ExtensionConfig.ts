import Pkg from '../package.json';

export const ExtensionId = `${Pkg.publisher}.cloudformation`;
export const ExtensionName = Pkg.displayName;
export const Version = Pkg.version;
export const ExtensionConfigKey = ExtensionId;
