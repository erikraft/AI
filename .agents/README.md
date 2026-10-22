# Agent skills

This repository uses the upstream [Pedro Nauck skills collection](https://github.com/pedronauck/skills) as an optional skill pack for **coding/development agents**.

## Install all skills

From the repository root, run:

```bash
bash scripts/install-agent-skills.sh
```

The official `skills` CLI installs the upstream skill packages and their supporting files into the agent locations selected by the CLI. It includes all three upstream buckets: `mine` (41), `curated` (34), and `marketing` (13), for 88 skills at the catalog snapshot currently recorded in the Hugging Face Space.

The full source remains at the upstream repository; this project does not republish the upstream skill contents in Git. For agent-specific setup options and current CLI behavior, follow the upstream installation documentation.

## Scope boundary

These are instructions for a **development agent**, not prompts or configuration for FLUX, Qwythos, Cosmos, or Qwen. The Hugging Face Space's inference functions do not load or transmit these skills to any model.
