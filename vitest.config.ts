import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['tst/**/*.test.ts'],
        exclude: ['**/node_modules/**', '**/out/**'],
        alias: {
            vscode: resolve(__dirname, 'tst/__mocks__/vscode.ts'),
            'vscode-languageclient/node': resolve(__dirname, 'tst/__mocks__/vscode-languageclient/node.ts'),
            'vscode-languageclient': resolve(__dirname, 'tst/__mocks__/vscode-languageclient.ts'),
        },
        coverage: {
            provider: 'v8',
            reporter: ['cobertura', 'html', 'text'],
            include: ['src/**/*.{js,ts}'],
            enabled: true,
        },
        pool: 'forks', // Run tests in separate processes for better isolation
        isolate: true, // Ensure each test file runs in isolation
        testTimeout: 30000,
    },
});
