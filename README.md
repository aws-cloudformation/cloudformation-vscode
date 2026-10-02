# AWS CloudFormation VSCode

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Main CI](https://github.com/aws-cloudformation/cloudformation-vscode/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/aws-cloudformation/cloudformation-vscode/actions/workflows/ci.yml)
[![CodeQL](https://github.com/aws-cloudformation/cloudformation-vscode/actions/workflows/github-code-scanning/codeql/badge.svg?branch=main)](https://github.com/aws-cloudformation/cloudformation-vscode/actions/workflows/github-code-scanning/codeql)

[![Node.js](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Faws-cloudformation%2Fcloudformation-vscode%2Frefs%2Fheads%2Fmain%2Fpackage.json&query=%24.engines.node&label=Node.js&color=339933&logo=node.js&logoColor=white)](https://github.com/aws-cloudformation/cloudformation-vscode/blob/main/package.json)
[![Latest Release](https://img.shields.io/github/v/release/aws-cloudformation/cloudformation-vscode?include_prereleases&sort=semver)](https://github.com/aws-cloudformation/cloudformation-vscode/releases)
[![Downloads](https://img.shields.io/github/downloads/aws-cloudformation/cloudformation-vscode/total.svg)](https://github.com/aws-cloudformation/cloudformation-vscode/releases)

## Overview

Language support for AWS CloudFormation templates in JSON and YAML, powered by the
[AWS CloudFormation Language Server](https://github.com/aws-cloudformation/cloudformation-languageserver).

The extension is a standalone client for the language server: it installs and updates the server, keeps it running,
and adds an AWS region selector to the status bar.

## Features

### Editing

- **Completion**: resource types, properties, intrinsic functions, template sections, and references to parameters,
  conditions, and mappings, including inline completions while you type
- **Hover documentation**: contextual help for resources, properties, and functions
- **Go to definition**: navigate to the definition of a referenced parameter, resource, condition, or mapping
- **Document symbols**: template structure in the Outline view and breadcrumbs
- **Code actions**: quick fixes for diagnostics, extracting hardcoded values to parameters, and inserting related
  resources

### Validation

- **Syntax**: immediate feedback on JSON and YAML errors
- **Schema**: resource schema validation using the schemas of the selected AWS region
- **cfn-lint**: linting with the bundled cfn-lint (no local Python installation required) or a local `cfn-lint`
  executable of your choice, with configurable delay and rule customization
- **CloudFormation Guard**: policy-as-code validation against managed rule packs (default:
  `cis-aws-benchmark-level-1`) or a custom rules file

### File support

- A `CloudFormation` language mode with syntax highlighting for `.template` and `.cfn` files
- CloudFormation templates in `.json`, `.yaml`, `.yml`, and `.txt` files

## Getting started

1. Install the extension (see [Installation](#installation)).
2. Open a CloudFormation template. The language server starts automatically and diagnostics appear in the editor and
   the Problems view.
3. Pick the AWS region whose resource schemas you want to validate against: click the `AWS Region` item in the status
   bar or run `AWS CloudFormation: Update Region`. The default is `us-east-1`, and the choice is remembered across
   sessions.

## Requirements

- Visual Studio Code 1.91 or later
- Internet access on first activation: the extension downloads a verified release of the language server into the
  user cache directory (`~/Library/Caches/aws/language-servers` on macOS, `%LOCALAPPDATA%\aws\language-servers` on
  Windows, `~/.cache/aws/language-servers` on Linux). Later activations reuse the cached install and fall back to it
  when a newer release cannot be downloaded. Regional resource schemas are downloaded on demand from the public
  CloudFormation schema endpoint of the selected region.

### AWS account access

The extension does not currently pass AWS credentials to the language server. Everything above works without an AWS
account. Server features that call AWS APIs on your behalf, such as deploying a template, listing stacks, server-side
template validation, and importing resource state, are not available in this extension.

## Commands

| Command                             | Description                                           |
| ----------------------------------- | ----------------------------------------------------- |
| `AWS CloudFormation: Update Region` | Select the AWS region whose resource schemas are used |
| `AWS CloudFormation: Restart LSP`   | Restart the language server                           |

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
| `aws.cloudformation.trace.server`                          | `"off"`                         | Trace communication with the language server (`messages`, `verbose`)     |
| `aws.iac.telemetry.enabled`                                | `false`                         | Share anonymous usage telemetry with AWS                                 |
| `aws.cloudformation.telemetry.logLevel`                    | `"info"`                        | Log level of the extension output channel; applies after a window reload |

## Telemetry

Telemetry is off by default. On first activation the extension asks whether to share anonymous usage data with AWS;
you can change the choice at any time with `aws.iac.telemetry.enabled`. The setting is specific to this extension;
it does not read or change the telemetry preference of any other extension. See the language server's
[telemetry documentation](https://github.com/aws-cloudformation/cloudformation-languageserver/tree/main/src/telemetry)
for what is collected.

## Troubleshooting

- The extension and the language server log to the **AWS CloudFormation** channel in the Output view. Set
  `aws.cloudformation.telemetry.logLevel` to `debug` for more detail, and `aws.cloudformation.trace.server` to
  `messages` or `verbose` to see the protocol traffic.
- If the server stops responding, run `AWS CloudFormation: Restart LSP`. A restart re-resolves the server install and
  repairs an incomplete one.
- To force a fresh download, delete the `language-servers/cloudformation-languageserver` folder under the cache
  directory listed in [Requirements](#requirements) and restart the server.
- Bugs and feature requests: [GitHub issues](https://github.com/aws-cloudformation/cloudformation-vscode/issues).

## Installation

Install **AWS CloudFormation** from the Visual Studio Code Marketplace or Open VSX, or download the `.vsix` package
from the [releases page](https://github.com/aws-cloudformation/cloudformation-vscode/releases) and install it with
`code --install-extension aws-iac-vscode.vsix` or **Extensions: Install from VSIX...** in VS Code.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to report issues and submit pull requests, including how to report
security issues. This project follows the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

Licensed under the Apache License 2.0. Third-party licenses are listed in
[THIRD-PARTY-LICENSES.txt](THIRD-PARTY-LICENSES.txt).
