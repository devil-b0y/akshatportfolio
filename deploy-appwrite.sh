#!/usr/bin/env bash
set -euo pipefail

# Deploy this static portfolio to Appwrite Sites.
# First run: install/log in to the Appwrite CLI, then answer the prompts from
# `appwrite init sites` with Static hosting, no build command, and output `.`.

if ! command -v appwrite >/dev/null 2>&1; then
  echo "Appwrite CLI is not installed. Install it first with: npm install -g appwrite-cli"
  exit 1
fi

if [ ! -f "appwrite.config.json" ]; then
  echo "No Appwrite site configuration found. Starting one-time setup..."
  echo "Choose Static hosting, leave install/build commands empty, and use . as the output directory."
  appwrite init sites
fi

echo "Deploying Team99 portfolio to Appwrite Sites..."
appwrite push sites

echo "Deployment submitted successfully. Check the Appwrite Console for its live URL and build status."
