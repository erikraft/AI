#!/usr/bin/env bash
set -euo pipefail

if ! command -v npx >/dev/null 2>&1; then
  echo "Error: Node.js/npm (npx) is required to install agent skills." >&2
  exit 1
fi

# Install the upstream skills for the agent(s) selected by the skills CLI.
# This does not modify prompts, weights, or inference routes in the Hugging Face Space.
exec npx skills add https://github.com/pedronauck/skills "$@"
