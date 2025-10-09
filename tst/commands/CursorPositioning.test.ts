import { findParameterDescriptionPosition } from '../../src/utils';

// Mock Position class for testing
class MockPosition {
    constructor(
        public line: number,
        public character: number,
    ) {}
}

// Wrapper function to convert vscode.Position to MockPosition for testing
function testFindParameterDescriptionPosition(
    text: string,
    parameterName: string,
    documentType: string,
): MockPosition | undefined {
    const position = findParameterDescriptionPosition(text, parameterName, documentType);
    return position ? new MockPosition(position.line, position.character) : undefined;
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

            const position = testFindParameterDescriptionPosition(jsonTemplate, 'MyParameter', 'JSON');

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

            const position = testFindParameterDescriptionPosition(jsonTemplate, 'MyParameter', 'JSON');

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

            const position = testFindParameterDescriptionPosition(yamlTemplate, 'MyParameter', 'YAML');

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

            const position = testFindParameterDescriptionPosition(yamlTemplate, 'MyParameter', 'YAML');

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

            const position = testFindParameterDescriptionPosition(jsonTemplate, 'MyParameter', 'JSON');

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

            const position = testFindParameterDescriptionPosition(jsonTemplate, 'MyParameter', 'JSON');

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

            const position = testFindParameterDescriptionPosition(jsonTemplate, 'My-Parameter.Name', 'JSON');

            expect(position).toBeDefined();
            expect(position!.line).toBe(4); // Line with Description
        });
    });
});
