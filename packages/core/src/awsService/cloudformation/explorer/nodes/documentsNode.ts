/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { TreeItemCollapsibleState, ThemeIcon } from 'vscode'
import { AWSTreeNodeBase } from '../../../../shared/treeview/nodes/awsTreeNodeBase'
import { DocumentManager, DocumentMetadata } from '../../documents/documentManager'

export class DocumentsNode extends AWSTreeNodeBase {
    public constructor(private readonly documentManager: DocumentManager) {
        super('Documents', TreeItemCollapsibleState.Collapsed)
        this.contextValue = 'documentsSection'
    }

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        const documents = this.documentManager.get()
        // Filter to only show CloudFormation documents like the original
        const cfnDocuments = documents.filter((doc) => doc.cfnType !== 'unknown')
        return cfnDocuments.map((doc: DocumentMetadata) => new DocumentNode(doc))
    }
}

class DocumentNode extends AWSTreeNodeBase {
    public constructor(public readonly document: DocumentMetadata) {
        super(document.fileName, TreeItemCollapsibleState.None)
        this.contextValue = 'document'
        this.description = this.getDescription(document)
        this.tooltip = `File: ${document.uri}\nType: ${document.type}\nCloudFormation Type: ${document.cfnType}`
        this.iconPath = this.getIcon(document)
    }

    private getDescription(doc: DocumentMetadata): string {
        if (doc.cfnType !== 'unknown') {
            return `${doc.type} • ${doc.cfnType}`
        }
        return doc.type
    }

    private getIcon(doc: DocumentMetadata): ThemeIcon {
        if (doc.cfnType === 'template') {
            return new ThemeIcon('file-code')
        }
        if (doc.cfnType === 'gitsync-deployment') {
            return new ThemeIcon('git-branch')
        }
        if (doc.type === 'YAML') {
            return new ThemeIcon('file-text')
        }
        if (doc.type === 'JSON') {
            return new ThemeIcon('json')
        }
        return new ThemeIcon('file')
    }

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        return []
    }
}
