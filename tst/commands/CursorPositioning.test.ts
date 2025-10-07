// Import the helper functions - we need to extract them to be testable
// For now, let's test the logic by recreating the functions here

// Mock Position class for testing
class MockPosition {
    constructor(
        public line: number,
        public character: number,
    ) {}
}

/**
 * Finds the position of the parameter description value where the cursor should be placed.
 * Returns the position between the quotes of the Description property.
 */
function findParameterDescriptionPosition(
    text: string,
    parameterName: string,
    documentType: string,
): MockPosition | undefined {
    const lines = text.split('\n');

    if (documentType === 'JSON') {
        return findJsonParameterDescriptionPosition(lines, parameterName);
    } else {
        return findYamlParameterDescriptionPosition(lines, parameterName);
    }
}

/**
 * Finds the description position in JSON format.
 * Looks for: "ParameterName": { ... "Description": "HERE" ... }
 */
function findJsonParameterDescriptionPosition(lines: string[], parameterName: string): MockPosition | undefined {
    let inParameter = false;
    const parameterPattern = new RegExp(`^\\s*"${escapeRegex(parameterName)}"\\s*:\\s*\\{`);

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (!inParameter && parameterPattern.test(line)) {
            inParameter = true;
            continue;
        }

        if (inParameter) {
            // Look for the Description property
            const descriptionMatch = line.match(/^(\s*)"Description"\s*:\s*"([^"]*)"/);
            if (descriptionMatch) {
                const indentation = descriptionMatch[1];
                const descriptionValue = descriptionMatch[2];
                // Position cursor between the quotes, after any existing description text
                const character = indentation.length + '"Description": "'.length + descriptionValue.length;
                return new MockPosition(i, character);
            }

            // Check if we've reached the end of this parameter
            if (line.match(/^\s*\}/)) {
                break;
            }
        }
    }

    return undefined;
}

/**
 * Finds the description position in YAML format.
 * Looks for: ParameterName: ... Description: "HERE" ...
 */
function findYamlParameterDescriptionPosition(lines: string[], parameterName: string): MockPosition | undefined {
    let inParameter = false;
    const parameterPattern = new RegExp(`^\\s*${escapeRegex(parameterName)}\\s*:`);

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (!inParameter && parameterPattern.test(line)) {
            inParameter = true;
            continue;
        }

        if (inParameter) {
            // Look for the Description property
            const descriptionMatch = line.match(/^(\s*)Description\s*:\s*"([^"]*)"/);
            if (descriptionMatch) {
                const indentation = descriptionMatch[1];
                const descriptionValue = descriptionMatch[2];
                // Position cursor between the quotes, after any existing description text
                const character = indentation.length + 'Description: "'.length + descriptionValue.length;
                return new MockPosition(i, character);
            }

            // Check if we've reached the end of this parameter (next parameter or section)
            if (line.match(/^\s*\w+\s*:/) && !line.match(/^\s*(Type|Default|Description|AllowedValues)\s*:/)) {
                break;
            }
        }
    }

    return undefined;
}

/**
 * Escapes special regex characters in a string.
 */
function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

describe('Cursor Positioning Logic', () => {
    describe('findParameterDescriptionPosition', () => {
        it('should find cursor position in JSON parameter description', () => {
            const jsonTemplate = `{
  "Parameters": {
    "MyParameter": {
      "Type": "String",
      "Default": "test",
      "Description": ""
    }
  }
}`;

            const position = findParameterDescriptionPosition(jsonTemplate, 'MyParameter', 'JSON');

            expect(position).toBeDefined();
            expect(position!.line).toBe(5); // Line with Description
            expect(position!.character).toBe(22); // Position after "Description": "
        });

        it('should find cursor position in JSON parameter description with existing text', () => {
            const jsonTemplate = `{
  "Parameters": {
    "MyParameter": {
      "Type": "String",
      "Default": "test",
      "Description": "Existing description"
    }
  }
}`;

            const position = findParameterDescriptionPosition(jsonTemplate, 'MyParameter', 'JSON');

            expect(position).toBeDefined();
            expect(position!.line).toBe(5); // Line with Description
            expect(position!.character).toBe(42); // Position after existing description text
        });

        it('should find cursor position in YAML parameter description', () => {
            const yamlTemplate = `Parameters:
  MyParameter:
    Type: String
    Default: test
    Description: ""`;

            const position = findParameterDescriptionPosition(yamlTemplate, 'MyParameter', 'YAML');

            expect(position).toBeDefined();
            expect(position!.line).toBe(4); // Line with Description
            expect(position!.character).toBe(18); // Position after 'Description: "'
        });

        it('should find cursor position in YAML parameter description with existing text', () => {
            const yamlTemplate = `Parameters:
  MyParameter:
    Type: String
    Default: test
    Description: "Existing description"`;

            const position = findParameterDescriptionPosition(yamlTemplate, 'MyParameter', 'YAML');

            expect(position).toBeDefined();
            expect(position!.line).toBe(4); // Line with Description
            expect(position!.character).toBe(38); // Position after existing description text
        });

        it('should return undefined if parameter not found', () => {
            const jsonTemplate = `{
  "Parameters": {
    "OtherParameter": {
      "Type": "String",
      "Description": ""
    }
  }
}`;

            const position = findParameterDescriptionPosition(jsonTemplate, 'MyParameter', 'JSON');

            expect(position).toBeUndefined();
        });

        it('should return undefined if description not found', () => {
            const jsonTemplate = `{
  "Parameters": {
    "MyParameter": {
      "Type": "String",
      "Default": "test"
    }
  }
}`;

            const position = findParameterDescriptionPosition(jsonTemplate, 'MyParameter', 'JSON');

            expect(position).toBeUndefined();
        });

        it('should handle parameter names with special characters', () => {
            const jsonTemplate = `{
  "Parameters": {
    "My-Parameter.Name": {
      "Type": "String",
      "Description": ""
    }
  }
}`;

            const position = findParameterDescriptionPosition(jsonTemplate, 'My-Parameter.Name', 'JSON');

            expect(position).toBeDefined();
            expect(position!.line).toBe(4); // Line with Description
        });
    });

    describe('escapeRegex', () => {
        it('should escape special regex characters', () => {
            expect(escapeRegex('test.name')).toBe('test\\.name');
            expect(escapeRegex('test-name')).toBe('test-name'); // Hyph
            expect(escapeRegex('test[0]')).toBe('test\\[0\\]');
            expect(escapeRegex('test(1)')).toBe('test\\(1\\)');
            expect(escapeRegex('test*')).toBe('test\\*');
            expect(escapeRegex('test+')).toBe('test\\+');
            expect(escapeRegex('test?')).toBe('test\\?');
            expect(escapeRegex('test^')).toBe('test\\^');
            expect(escapeRegex('test$')).toBe('test\\$');
            expect(escapeRegex('test{}')).toBe('test\\{\\}');
            expect(escapeRegex('test|')).toBe('test\\|');
            expect(escapeRegex('test\\')).toBe('test\\\\');
        });

        it('should not escape normal characters', () => {
            expect(escapeRegex('normalName')).toBe('normalName');
            expect(escapeRegex('MyParameter123')).toBe('MyParameter123');
        });
    });
});
