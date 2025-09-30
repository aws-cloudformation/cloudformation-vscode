const { createDefaultPreset } = require('ts-jest');

const defaultPreset = createDefaultPreset();

/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
    ...defaultPreset,
    testMatch: ['<rootDir>/tst/**/*.test.ts'],
    collectCoverage: true,
    coverageReporters: ['cobertura', 'html', 'text'],
    coverageDirectory: 'coverage',
    collectCoverageFrom: ['<rootDir>/src/**/*.{js,ts}'],
    testPathIgnorePatterns: ['<rootDir>/out/', '<rootDir>/node_modules/'],
    modulePathIgnorePatterns: ['<rootDir>/out/'],
};
