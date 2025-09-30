import * as fs from 'fs';
import * as path from 'path';

describe('CloudFormation Grammar', () => {
    let grammar: any;

    beforeAll(() => {
        // Load grammar
        const grammarPath = path.join(__dirname, '../syntaxes/cloudformation.tmLanguage.json');
        grammar = JSON.parse(fs.readFileSync(grammarPath, 'utf8'));
    });

    describe('Grammar Structure', () => {
        it('should have correct basic structure', () => {
            expect(grammar.name).toBe('CloudFormation');
            expect(grammar.scopeName).toBe('source.cloudformation');
            expect(grammar.fileTypes).toContain('template');
            expect(grammar.fileTypes).toContain('cfn');
        });

        it('should include dual-format detection patterns', () => {
            expect(grammar.patterns).toHaveLength(2);

            // JSON detection pattern
            expect(grammar.patterns[0].begin).toBe('^\\s*\\{');
            expect(grammar.patterns[0].name).toBe('meta.cloudformation.json');
            expect(grammar.patterns[0].patterns[0].include).toBe('source.json');

            // YAML detection pattern
            expect(grammar.patterns[1].begin).toBe('^(?!\\s*\\{)');
            expect(grammar.patterns[1].name).toBe('meta.cloudformation.yaml');
        });

        it('should have repository with required patterns', () => {
            const requiredPatterns = ['cfn-top-level-keys', 'cfn-logical-ids', 'cfn-functions'];

            requiredPatterns.forEach((pattern) => {
                expect(grammar.repository[pattern]).toBeDefined();
            });
        });
    });

    describe('CloudFormation-Specific Patterns', () => {
        it('should match top-level CloudFormation sections', () => {
            const pattern = grammar.repository['cfn-top-level-keys'].patterns[0];
            const regex = new RegExp(pattern.match);

            const validSections = [
                'AWSTemplateFormatVersion:',
                'Description:',
                'Metadata:',
                'Parameters:',
                'Mappings:',
                'Conditions:',
                'Transform:',
                'Resources:',
                'Outputs:',
            ];

            validSections.forEach((section) => {
                expect(regex.test(section)).toBe(true);
            });

            expect(regex.test('InvalidSection:')).toBe(false);
        });

        it('should match CloudFormation functions', () => {
            const cfnFunctions = grammar.repository['cfn-functions'];
            expect(cfnFunctions.patterns).toHaveLength(3);

            // Short form functions (!Ref, !GetAtt, etc.)
            const shortFormPattern = cfnFunctions.patterns[0];
            const shortFormRegex = new RegExp(shortFormPattern.match);
            expect(shortFormRegex.test('!Ref')).toBe(true);
            expect(shortFormRegex.test('!GetAtt')).toBe(true);
            expect(shortFormRegex.test('!Join')).toBe(true);

            // Long form functions (Fn::GetAtt, Fn::Join, etc.)
            const longFormPattern = cfnFunctions.patterns[1];
            const longFormRegex = new RegExp(longFormPattern.match);
            expect(longFormRegex.test('Fn::GetAtt')).toBe(true);
            expect(longFormRegex.test('Fn::Join')).toBe(true);

            // Standalone Ref (only matches when followed by colon)
            const refPattern = cfnFunctions.patterns[2];
            const refRegex = new RegExp(refPattern.match);
            expect(refRegex.test('Ref:')).toBe(true);
            expect(refRegex.test('Ref: MyResource')).toBe(true);
            expect(refRegex.test('Ref')).toBe(false); // Should not match without colon
        });

        it('should match logical IDs in different sections', () => {
            const logicalIds = grammar.repository['cfn-logical-ids'];
            expect(logicalIds.patterns).toHaveLength(5);

            // Check that we have patterns for Resources, Parameters, Conditions, Outputs, and Mappings
            const sectionNames: (string | null)[] = logicalIds.patterns.map((pattern: any) => {
                const match = (pattern.begin as string).match(/\^\(([^)]+)\)/);
                return match ? match[1] : null;
            });

            expect(sectionNames).toContain('Resources');
            expect(sectionNames).toContain('Parameters');
            expect(sectionNames).toContain('Conditions');
            expect(sectionNames).toContain('Outputs');
            expect(sectionNames).toContain('Mappings');
        });
    });

    describe('Scope Names', () => {
        it('should define CloudFormation-specific scopes', () => {
            const grammarString = JSON.stringify(grammar);

            const expectedScopes = [
                'entity.name.tag.cloudformation.top-level',
                'entity.name.function.cloudformation.resource-id',
                'entity.name.function.cloudformation.parameter-id',
                'entity.name.function.cloudformation.condition-id',
                'entity.name.function.cloudformation.output-id',
                'entity.name.function.cloudformation.mapping-id',
                'keyword.control.cloudformation.function',
            ];

            expectedScopes.forEach((scope) => {
                expect(grammarString).toContain(scope);
            });
        });

        it('should use hierarchical scope naming', () => {
            const grammarString = JSON.stringify(grammar);

            // Check that all CloudFormation scopes follow the pattern
            expect(grammarString).toContain('cloudformation.top-level');
            expect(grammarString).toContain('cloudformation.resource-id');
            expect(grammarString).toContain('cloudformation.parameter-id');
            expect(grammarString).toContain('cloudformation.condition-id');
            expect(grammarString).toContain('cloudformation.output-id');
            expect(grammarString).toContain('cloudformation.mapping-id');
            expect(grammarString).toContain('cloudformation.function');
        });
    });

    describe('Format Detection', () => {
        it('should detect JSON format correctly', () => {
            const jsonPattern = grammar.patterns[0];
            const jsonRegex = new RegExp(jsonPattern.begin);

            expect(jsonRegex.test('{')).toBe(true);
            expect(jsonRegex.test('  {')).toBe(true);
            expect(jsonRegex.test('\t{')).toBe(true);
            expect(jsonRegex.test('AWSTemplateFormatVersion:')).toBe(false);
        });

        it('should detect YAML format correctly', () => {
            const yamlPattern = grammar.patterns[1];
            const yamlRegex = new RegExp(yamlPattern.begin);

            expect(yamlRegex.test('AWSTemplateFormatVersion:')).toBe(true);
            expect(yamlRegex.test('Resources:')).toBe(true);
            expect(yamlRegex.test('{')).toBe(false);
            expect(yamlRegex.test('  {')).toBe(false);
        });
    });

    describe('YAML Integration', () => {
        it('should include standard YAML patterns', () => {
            const yamlPattern = grammar.patterns[1];
            const yamlPatterns = yamlPattern.patterns;

            // Check that we include standard YAML patterns
            const includePatterns: string[] = yamlPatterns.map((p: any) => p.include as string).filter(Boolean);
            expect(includePatterns).toContain('#comment');
            expect(includePatterns).toContain('#property');
            expect(includePatterns).toContain('#directive');
            expect(includePatterns).toContain('#node');
        });

        it('should include CloudFormation-specific patterns before standard YAML', () => {
            const yamlPattern = grammar.patterns[1];
            const yamlPatterns = yamlPattern.patterns;

            // CloudFormation patterns should come first
            expect(yamlPatterns[1].include).toBe('#cfn-logical-ids');
            expect(yamlPatterns[2].include).toBe('#cfn-top-level-keys');
        });
    });
});
