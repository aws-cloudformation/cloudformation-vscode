# AWS CloudFormation Extension for Visual Studio Code

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Main CI](https://github.com/aws-cloudformation/cloudformation-languageserver/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/aws-cloudformation/cloudformation-languageserver/actions/workflows/ci.yml)
[![CodeQL](https://github.com/aws-cloudformation/cloudformation-languageserver/actions/workflows/github-code-scanning/codeql/badge.svg?branch=main)](https://github.com/aws-cloudformation/cloudformation-languageserver/actions/workflows/github-code-scanning/codeql)

[![Node.js](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Faws-cloudformation%2Fcloudformation-languageserver%2Frefs%2Fheads%2Fmain%2Fpackage.json&query=%24.engines.node&label=Node.js&color=339933&logo=node.js&logoColor=white)](https://github.com/aws-cloudformation/cloudformation-vscode/blob/main/package.json)
[![Latest Release](https://img.shields.io/github/v/release/aws-cloudformation/cloudformation-vscode?include_prereleases&sort=semver)](https://github.com/aws-cloudformation/cloudformation-vscode/releases)
[![Downloads](https://img.shields.io/github/downloads/aws-cloudformation/cloudformation-vscode/total.svg)](https://github.com/aws-cloudformation/cloudformation-vscode/releases)

## Overview

Language support for AWS CloudFormation templates in JSON and YAML, powered by the
[AWS CloudFormation Language Server](https://github.com/aws-cloudformation/cloudformation-languageserver).
The extension starts and manages the language server and adds an AWS region selector to the status bar.

## Features

### Editing

- **Completion**: resource types, properties, intrinsic functions, template sections, and references to parameters,
  conditions, and mappings, including inline completions while you type
- **Hover documentation**: contextual help for resources, properties, and functions
- **Go to definition**: navigate to the definition of a referenced parameter, resource, condition, or mapping
- **Document symbols**: template structure in the Outline view and breadcrumbs

### Validation

- **Syntax**: immediate feedback on JSON and YAML errors
- **Schema**: resource schema validation using the schemas of the selected AWS region
- **cfn-lint**: linting with the bundled cfn-lint (no local Python installation required) or a local `cfn-lint`
  executable of your choice, with configurable delay and rule customization
- **CloudFormation Guard**: policy-as-code validation against managed rule packs (default:
  `cis-aws-benchmark-level-1`) or a custom rules file

### Code actions and code lenses

- Quick fixes for diagnostics, extracting hardcoded values to parameters, and inserting related resources
- Code lenses to validate and deploy a template and to open the template of a managed stack

### File support

- A `CloudFormation` language mode with syntax highlighting for `.template` and `.cfn` files
- CloudFormation templates in `.json`, `.yaml`, `.yml`, and `.txt` files

## Requirements

- Visual Studio Code 1.91 or later
- Internet access on first activation: the extension downloads a verified release of the language server into the
  VS Code cache directory. Later activations reuse the cached install and fall back to it when a newer release cannot be
  downloaded.

AWS-backed features (regional schemas, template validation, deployment, stack operations) use the region selected in
the status bar and the AWS credentials available to the language server process through the AWS SDK default credential
provider chain.

## Commands

| Command                             | Description                                                    |
| ----------------------------------- | -------------------------------------------------------------- |
| `AWS CloudFormation: Update Region` | Select the AWS region used for schemas and AWS-backed features |
| `AWS CloudFormation: Restart LSP`   | Restart the language server                                    |

## Settings

| Setting                                                    | Default                         | Description                                                              |
| ---------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------ |
| `aws.cloudformation.hover.enabled`                         | `true`                          | Enable hover documentation                                               |
| `aws.cloudformation.completion.enabled`                    | `true`                          | Enable completion                                                        |
| `aws.cloudformation.diagnostics.cfnLint.enabled`           | `true`                          | Enable cfn-lint diagnostics                                              |
| `aws.cloudformation.diagnostics.cfnLint.lintOnChange`      | `true`                          | Run cfn-lint when the document changes                                   |
| `aws.cloudformation.diagnostics.cfnLint.delayMs`           | `3000`                          | Delay before running cfn-lint after a change                             |
| `aws.cloudformation.diagnostics.cfnLint.path`              | `""`                            | Path to a local cfn-lint executable; empty uses the bundled version      |
| `aws.cloudformation.diagnostics.cfnLint.customization`     | `{ "includeChecks": ["I"] }`    | cfn-lint rule customization (ignore, include, mandatory, regions, ...)   |
| `aws.cloudformation.diagnostics.cfnGuard.enabled`          | `true`                          | Enable CloudFormation Guard diagnostics                                  |
| `aws.cloudformation.diagnostics.cfnGuard.validateOnChange` | `true`                          | Run cfn-guard when the document changes                                  |
| `aws.cloudformation.diagnostics.cfnGuard.delayMs`          | `1000`                          | Delay before running cfn-guard after a change                            |
| `aws.cloudformation.diagnostics.cfnGuard.enabledRulePacks` | `["cis-aws-benchmark-level-1"]` | Managed rule packs to validate against                                   |
| `aws.cloudformation.diagnostics.cfnGuard.rulesFile`        | `""`                            | Path to a custom cfn-guard rules file; empty uses the enabled rule packs |
| `aws.cloudformation.server.trace`                          | `"off"`                         | Trace communication with the language server (`messages`, `verbose`)     |
| `aws.cloudformation.telemetry.enabled`                     | `false`                         | Share anonymous usage telemetry with AWS                                 |
| `aws.cloudformation.telemetry.logLevel`                    | `"info"`                        | Log level of the extension output channel                                |

## Telemetry

Telemetry is off by default. On first activation the extension asks whether to share anonymous usage data with AWS;
you can change the choice at any time with `aws.cloudformation.telemetry.enabled`. See the language server's
[telemetry documentation](https://github.com/aws-cloudformation/cloudformation-languageserver/tree/main/src/telemetry)
for what is collected.

## Installation

Install **AWS CloudFormation** from the Visual Studio Code Marketplace or Open VSX, or install a `.vsix` package from
the [releases page](https://github.com/aws-cloudformation/cloudformation-vscode/releases).

## License

Licensed under the Apache License 2.0.
