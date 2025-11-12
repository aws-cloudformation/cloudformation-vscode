#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# Script to setup local CloudFormation LSP server for E2E tests
# Downloads the latest LSP server release

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../../../.." && pwd)"
LSP_DIR="$REPO_ROOT/.lsp-server"

echo "Setting up CloudFormation LSP server for E2E tests..."

# Detect platform and architecture
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

case "$OS" in
    darwin) PLATFORM="darwin" ;;
    linux) PLATFORM="linux" ;;
    *) echo "Unsupported OS: $OS"; exit 1 ;;
esac

case "$ARCH" in
    x86_64) ARCH="x64" ;;
    arm64|aarch64) ARCH="arm64" ;;
    *) echo "Unsupported architecture: $ARCH"; exit 1 ;;
esac

NODE_VERSION="22"

# Fetch latest release
echo "Fetching latest LSP server release..."
RELEASE_URL="https://api.github.com/repos/aws-cloudformation/cloudformation-languageserver/releases/latest"
DOWNLOAD_URL=$(curl -s "$RELEASE_URL" | grep "browser_download_url.*${PLATFORM}-${ARCH}-node${NODE_VERSION}.zip" | cut -d'"' -f4 | head -1)

if [ -z "$DOWNLOAD_URL" ]; then
    echo "Error: Could not find LSP server release for ${PLATFORM}-${ARCH}-node${NODE_VERSION}"
    exit 1
fi

# Clean and recreate directory
rm -rf "$LSP_DIR"
mkdir -p "$LSP_DIR"
cd "$LSP_DIR"

# Download and extract
echo "Downloading: $DOWNLOAD_URL"
curl -sL -o lsp-server.zip "$DOWNLOAD_URL"
unzip -q lsp-server.zip
rm lsp-server.zip

# Verify
if [ ! -f "cfn-lsp-server-standalone.js" ]; then
    echo "Error: cfn-lsp-server-standalone.js not found after extraction"
    exit 1
fi

echo ""
echo "✓ LSP server ready at: $LSP_DIR"
echo ""
echo "Run tests with:"
echo "__CLOUDFORMATIONLSP_PATH=\"$LSP_DIR\" npm run testE2E -w packages/toolkit"
