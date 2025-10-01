import { getTemplatePath, confirmCapabilities } from '../../src/ui/InputBox';
import { window, workspace, Uri } from 'vscode';
import { DocumentManager } from '../../src/documents/DocumentManager';
import { Capability } from '@aws-sdk/client-cloudformation';

jest.mock('vscode');

const mockWindow = window as jest.Mocked<typeof window>;
const mockWorkspace = workspace as jest.Mocked<typeof workspace>;
const mockUri = Uri as jest.Mocked<typeof Uri>;

describe('InputBox', () => {
    let mockDocumentManager: jest.Mocked<DocumentManager>;

    beforeEach(() => {
        jest.clearAllMocks();

        mockDocumentManager = {
            get: jest.fn(),
        } as any;

        mockWorkspace.asRelativePath = jest.fn().mockImplementation((uri: Uri) => uri.fsPath.replace(/^\//, ''));

        // Mock Uri.parse to return a Uri-like object
        mockUri.parse = jest.fn().mockImplementation((uriString: string) => ({
            fsPath: uriString.replace('file://', ''),
            scheme: 'file',
            toString: () => uriString,
        }));
    });

    describe('getTemplatePath', () => {
        it('should sort open files by fileName', async () => {
            // Setup mock documents
            mockDocumentManager.get.mockReturnValue([
                { uri: 'file:///path/to/z.yaml', cfnType: 'template', fileName: 'z.yaml' },
                { uri: 'file:///path/to/a.json', cfnType: 'template', fileName: 'a.json' },
                { uri: 'file:///path/to/b.template', cfnType: 'template', fileName: 'b.template' },
            ] as any);

            mockWindow.showQuickPick.mockResolvedValue({
                label: 'a.json',
                uri: 'file:///path/to/a.json',
            } as any);

            await getTemplatePath(mockDocumentManager);

            // Verify showQuickPick was called with sorted items
            expect(mockWindow.showQuickPick).toHaveBeenCalledWith(
                [
                    { label: 'a.json', description: 'path/to/a.json', uri: 'file:///path/to/a.json' },
                    { label: 'b.template', description: 'path/to/b.template', uri: 'file:///path/to/b.template' },
                    { label: 'z.yaml', description: 'path/to/z.yaml', uri: 'file:///path/to/z.yaml' },
                ],
                expect.any(Object),
            );
        });

        it('should filter only valid CloudFormation templates', async () => {
            mockDocumentManager.get.mockReturnValue([
                { uri: 'file:///valid.yaml', cfnType: 'template', fileName: 'valid.yaml' },
                { uri: 'file:///invalid.yaml', cfnType: 'other', fileName: 'invalid.yaml' },
            ] as any);

            mockWindow.showQuickPick.mockResolvedValue(undefined);

            await getTemplatePath(mockDocumentManager);

            expect(mockWindow.showQuickPick).toHaveBeenCalledWith(
                [{ label: 'valid.yaml', description: 'valid.yaml', uri: 'file:///valid.yaml' }],
                expect.any(Object),
            );
        });

        it('should return undefined when user cancels', async () => {
            mockDocumentManager.get.mockReturnValue([]);
            mockWindow.showQuickPick.mockResolvedValue(undefined);

            const result = await getTemplatePath(mockDocumentManager);

            expect(result).toBeUndefined();
        });

        it('should return selected file URI', async () => {
            mockDocumentManager.get.mockReturnValue([
                { uri: 'file:///test.yaml', cfnType: 'template', fileName: 'test.yaml' },
                { uri: 'file:///other.json', cfnType: 'template', fileName: 'other.json' },
            ] as any);

            mockWindow.showQuickPick.mockResolvedValue({
                uri: 'file:///test.yaml',
            } as any);

            const result = await getTemplatePath(mockDocumentManager);

            expect(result).toBe('file:///test.yaml');
        });
    });

    describe('confirmCapabilities', () => {
        it('should return detected capabilities when user selects Yes', async () => {
            const capabilities: Capability[] = ['CAPABILITY_IAM', 'CAPABILITY_NAMED_IAM'];
            mockWindow.showQuickPick.mockResolvedValue('Yes' as any);

            const result = await confirmCapabilities(capabilities);

            expect(result).toEqual(capabilities);
            expect(mockWindow.showQuickPick).toHaveBeenCalledWith(['Yes', 'No, modify capabilities'], {
                placeHolder: 'Use capabilities: CAPABILITY_IAM, CAPABILITY_NAMED_IAM?',
                canPickMany: false,
            });
        });

        it('should return empty array when no capabilities detected and user selects Yes', async () => {
            const capabilities: Capability[] = [];
            mockWindow.showQuickPick.mockResolvedValue('Yes' as any);

            const result = await confirmCapabilities(capabilities);

            expect(result).toEqual([]);
            expect(mockWindow.showQuickPick).toHaveBeenCalledWith(['Yes', 'No, modify capabilities'], {
                placeHolder: 'Use capabilities: (none)?',
                canPickMany: false,
            });
        });

        it('should return undefined when user cancels first prompt', async () => {
            const capabilities: Capability[] = ['CAPABILITY_IAM'];
            mockWindow.showQuickPick.mockResolvedValue(undefined);

            const result = await confirmCapabilities(capabilities);

            expect(result).toBeUndefined();
        });

        it('should show multiselect when user selects No, modify capabilities', async () => {
            const capabilities: Capability[] = ['CAPABILITY_IAM'];
            mockWindow.showQuickPick.mockResolvedValueOnce('No, modify capabilities' as any).mockResolvedValueOnce([
                { label: 'CAPABILITY_IAM', picked: true },
                { label: 'CAPABILITY_NAMED_IAM', picked: false },
            ] as any);

            const result = await confirmCapabilities(capabilities);

            expect(result).toEqual(['CAPABILITY_IAM', 'CAPABILITY_NAMED_IAM']);
            expect(mockWindow.showQuickPick).toHaveBeenCalledTimes(2);
            expect(mockWindow.showQuickPick).toHaveBeenNthCalledWith(
                2,
                [
                    { label: 'CAPABILITY_IAM', picked: true },
                    { label: 'CAPABILITY_NAMED_IAM', picked: false },
                    { label: 'CAPABILITY_AUTO_EXPAND', picked: false },
                ],
                {
                    placeHolder: 'Select capabilities to use',
                    canPickMany: true,
                },
            );
        });

        it('should return undefined when user cancels multiselect', async () => {
            const capabilities: Capability[] = ['CAPABILITY_IAM'];
            mockWindow.showQuickPick
                .mockResolvedValueOnce('No, modify capabilities' as any)
                .mockResolvedValueOnce(undefined);

            const result = await confirmCapabilities(capabilities);

            expect(result).toBeUndefined();
        });

        it('should preselect detected capabilities in multiselect', async () => {
            const capabilities: Capability[] = ['CAPABILITY_IAM', 'CAPABILITY_AUTO_EXPAND'];
            mockWindow.showQuickPick
                .mockResolvedValueOnce('No, modify capabilities' as any)
                .mockResolvedValueOnce([] as any);

            await confirmCapabilities(capabilities);

            expect(mockWindow.showQuickPick).toHaveBeenNthCalledWith(
                2,
                [
                    { label: 'CAPABILITY_IAM', picked: true },
                    { label: 'CAPABILITY_NAMED_IAM', picked: false },
                    { label: 'CAPABILITY_AUTO_EXPAND', picked: true },
                ],
                {
                    placeHolder: 'Select capabilities to use',
                    canPickMany: true,
                },
            );
        });
    });
});
