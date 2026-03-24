# AWS CloudFormation Extension for VS Code

<div align="center">

[![build](https://github.com/aws-cloudformation/cloudformation-vscode/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/aws-cloudformation/cloudformation-vscode/actions/workflows/ci.yml)
&nbsp;
[![CodeQL](https://github.com/aws-cloudformation/cloudformation-vscode/actions/workflows/github-code-scanning/codeql/badge.svg?branch=main)](https://github.com/aws-cloudformation/cloudformation-vscode/actions/workflows/github-code-scanning/codeql)

</div>


## Overview

This VS Code extension provides comprehensive language server support for AWS CloudFormation templates, delivering
intelligent editing capabilities for Infrastructure as Code development.

## Features

### Language Support

- **Multi-format Support**: Works with JSON, YAML, and plain text CloudFormation templates
- **Syntax Validation**: Real-time syntax checking and error detection
- **Schema Validation**: CloudFormation resource schema validation against AWS specifications
- **Syntax Highlighting**: CloudFormation-specific syntax highlighting for `.template`, `.cfn`, `.json`, `.txt`, and
  `.yaml` files
- **Language Detection**: Automatic CloudFormation content detection
- **Bracket Matching**: Intelligent bracket matching and auto-indentation

### Intelligent Code Assistance

- **Auto-completion**: Context-aware suggestions for CloudFormation resources, properties, and values
- **Resource Completion**: Auto-complete AWS resource types (e.g., `AWS::EC2::Instance`, `AWS::S3::Bucket`)
- **Property Completion**: Context-aware property suggestions for each resource type
- **Intrinsic Functions**: Auto-complete CloudFormation intrinsic functions (`!Ref`, `!GetAtt`, `!Sub`, etc.)
- **Parameter & Output References**: Smart completion for template parameters and outputs
- **Condition References**: Auto-complete condition names and logical functions
- **Hover Documentation**: Inline documentation for AWS resources and properties
- **Go to Definition**: Navigate to resource definitions within templates
- **Code Actions**: Quick fixes and refactoring suggestions

### CloudFormation Linting

- **cfn-lint Integration**: Built-in CloudFormation linting using cfn-lint rules
- **Real-time Validation**: Lint-on-change with configurable delay (default: 3 seconds)
- **Comprehensive Rule Coverage**: Validates template structure, resource properties, and AWS best practices
- **Pyodide-powered**: Runs cfn-lint in a WebAssembly environment for fast, local validation
- **Template Structure Validation**: Verify CloudFormation template structure and requirements
- **Configurable Validation**: Adjust linting sensitivity and delay settings

### AWS Integration

- **AWS Profile Management**: Select and manage AWS profiles for authentication
- **CloudFormation Stack Operations**: List and interact with existing CloudFormation stacks
- **Region-aware Schema Loading**: Load AWS resource schemas for specific regions
- **AWS API Integration**: Direct integration with CloudFormation, IAM, and STS APIs
- **Multi-region Support**: Work with resources across different AWS regions
- **Credential Management**: Support for various AWS authentication methods

## Installation

This extension can be installed from the VS Code marketplace or by installing the .vsix package directly.

## Supported File Types

The extension activates for the following file types and patterns:

- CloudFormation templates (`.template`, `.cfn`)
- JSON files (`.json`)
- YAML files (`.yaml`, `.yml`)
- Plain text files (`.txt`)

## License

Licensed under the Apache License 2.0.
