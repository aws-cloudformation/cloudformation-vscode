import { afterEach, describe, expect, it, vi } from 'vitest';
import { environment } from '../../src/utils/ExtensionConfig';

describe('environment', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('lets an explicit CFN_LSP_ENVIRONMENT override the build channel', () => {
        vi.stubEnv('AWS_ENV', 'prod');
        vi.stubEnv('CFN_LSP_ENVIRONMENT', 'beta');

        expect(environment()).toBe('beta');
    });

    it('trims and lowercases the override value', () => {
        vi.stubEnv('CFN_LSP_ENVIRONMENT', '  BeTa  ');

        expect(environment()).toBe('beta');
    });

    it('falls through to the build channel on an invalid override', () => {
        vi.stubEnv('CFN_LSP_ENVIRONMENT', 'not-a-channel');
        vi.stubEnv('AWS_ENV', 'alpha');

        expect(environment()).toBe('alpha');
    });

    it('defaults to prod when neither the override nor the build channel is set', () => {
        vi.stubEnv('CFN_LSP_ENVIRONMENT', '');
        vi.stubEnv('AWS_ENV', '');

        expect(environment()).toBe('prod');
    });
});
