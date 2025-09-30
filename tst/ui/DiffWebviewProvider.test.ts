import { DiffWebviewProvider } from '../../src/ui/DiffWebviewProvider';
import { TemplateChange } from '../../src/cfn/TemplateRequestType';

describe('DiffWebviewProvider', () => {
    let provider: DiffWebviewProvider;
    let mockWebviewView: any;

    beforeEach(() => {
        provider = new DiffWebviewProvider();
        mockWebviewView = {
            webview: {
                html: '',
                options: {},
                cspSource: 'test',
            },
        };
    });

    test('should update data with stack name and changes', () => {
        const changes: TemplateChange[] = [
            {
                type: 'Resource',
                resourceChange: {
                    action: 'Add',
                    logicalResourceId: 'TestBucket',
                    resourceType: 'AWS::S3::Bucket',
                    scope: ['Properties'],
                    details: [
                        {
                            Target: {
                                Attribute: 'Properties' as any,
                                Name: 'TestBucket',
                                RequiresRecreation: 'Never',
                            },
                        },
                    ],
                },
            },
        ];

        provider.updateData('test-stack', changes);
        expect(provider['stackName']).toBe('test-stack');
        expect(provider['changes']).toEqual(changes);
    });

    test('should resolve webview view and generate HTML', () => {
        provider.resolveWebviewView(mockWebviewView);

        expect(mockWebviewView.webview.html).toContain('No changes detected');
    });

    test('should generate HTML with changes', () => {
        const changes: TemplateChange[] = [
            {
                resourceChange: {
                    action: 'Add',
                    logicalResourceId: 'TestBucket',
                    resourceType: 'AWS::S3::Bucket',
                },
            },
        ];

        provider.updateData('test-stack', changes);
        provider.resolveWebviewView(mockWebviewView);

        expect(mockWebviewView.webview.html).toContain('TestBucket');
        expect(mockWebviewView.webview.html).toContain('Add');
        expect(mockWebviewView.webview.html).toContain('AWS::S3::Bucket');
    });
});
