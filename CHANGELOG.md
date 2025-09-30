# Changelog

All notable changes to the AWS CloudFormation VS Code Extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.4]

### Added
- **Language Support**: CloudFormation-specific syntax highlighting and language configuration for .template and .cfn files
- **IntelliSense**: Advanced auto-completion for CloudFormation resources, properties, and intrinsic functions
- **Hover Documentation**: Contextual help and documentation for AWS resources and properties
- **Real-time Validation**: Immediate feedback on template errors and syntax issues
- **AWS Integration**: 
  - AWS profile selection and management
  - CloudFormation stack listing functionality
  - Credential management with support for multiple authentication methods
- **Configuration Options**:
  - Language server debugging and tracing levels (off/messages/verbose)
  - Telemetry collection settings with configurable log levels
  - Feature toggles for hover information and auto-completion
  - cfn-lint integration with customizable delay and change detection
- **Multi-format Support**: JSON, YAML, .template, and .cfn file formats
- **Language Server Protocol**: Full LSP implementation for CloudFormation templates

