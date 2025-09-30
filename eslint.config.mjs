import { globalIgnores } from 'eslint/config';
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import eslintPluginImport from 'eslint-plugin-import';
import eslintPluginPromise from 'eslint-plugin-promise';

export default tseslint.config([
    globalIgnores([
        'build/',
        'bundle/',
        'coverage/',
        'out/',
        'node_modules/',
        'eslint.config.mjs',
        'jest.*.js',
        'webpack.*.js',
        '**/*.json',
        '**/*.yaml',
        '**/*.zip',
        '**/.DS_Store',
        '**/.tsbuildinfo',
    ]),
    eslint.configs.recommended,
    tseslint.configs.recommendedTypeChecked,
    eslintPluginPrettierRecommended,
    {
        languageOptions: {
            parserOptions: {
                project: 'tsconfig.json',
                tsconfigRootDir: import.meta.dirname,
            },
        },
    },
    {
        files: ['**'],
        settings: {
            'import/core-modules': ['vscode'],
        },
        extends: [
            eslintPluginImport.flatConfigs.recommended,
            eslintPluginImport.flatConfigs.typescript,
            eslintPluginPromise.configs['flat/recommended'],
        ],
        rules: {
            '@typescript-eslint/no-unused-vars': ['error', { caughtErrors: 'none', argsIgnorePattern: '^_' }],
            eqeqeq: 'error',
            'promise/catch-or-return': 'off',
            'promise/always-return': 'off',

            // TypeScript strict rules
            '@typescript-eslint/no-floating-promises': 'error',
            '@typescript-eslint/await-thenable': 'error',
            '@typescript-eslint/no-misused-promises': 'error',
            '@typescript-eslint/no-non-null-assertion': 'error',
            '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'as' }],
            '@typescript-eslint/prefer-nullish-coalescing': 'error',
            '@typescript-eslint/prefer-optional-chain': 'error',
            'no-return-await': 'off',
            '@typescript-eslint/return-await': ['error', 'always'],

            // Import rules
            'import/no-self-import': 'error',
            'import/no-useless-path-segments': 'error',
            'import/no-deprecated': 'warn',
            'import/first': 'error',
            'import/no-duplicates': ['error', { 'prefer-inline': true }],

            // Error prevention
            'no-template-curly-in-string': 'error',
            'no-unreachable-loop': 'error',
            'require-atomic-updates': 'error',
            'array-callback-return': 'error',
            'no-constructor-return': 'error',
            'no-promise-executor-return': 'error',
            'no-unmodified-loop-condition': 'error',
            'no-unused-private-class-members': 'error',

            // Security rules
            'no-eval': 'error',
            'no-implied-eval': 'error',
            'no-new-func': 'error',
        },
    },
    {
        files: ['tst/**'],
        rules: {
            '@typescript-eslint/no-unsafe-argument': 'off',
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/unbound-method': 'off',
            '@typescript-eslint/no-unsafe-assignment': 'off',
            '@typescript-eslint/no-unsafe-member-access': 'off',
            '@typescript-eslint/no-unsafe-call': 'off',
            '@typescript-eslint/no-non-null-assertion': 'off',
        },
    },
]);
