# Agent skills catalog

This folder catalogs the upstream agent skills for development tooling. It is deliberately separate from model-inference code.

- Full catalog: [catalog.json](catalog.json)
- Upstream source: https://github.com/pedronauck/skills
- Snapshot used for this catalog: `9a5254eba0a80d1245214f0ce476622fb23d762c`
- Install the full skill packages on a supported development agent with: `npx skills add https://github.com/pedronauck/skills`

## Separation from model inference

These files describe tools/instructions for a development agent. They are **not** appended to user prompts and are not passed to FLUX, Qwythos, Cosmos, or Qwen. They do not change model weights, model identifiers, safety settings, inference parameters, or API routes.

The full upstream files are installed directly from the original repository when needed rather than redistributed here. This folder contains only a catalog of skill names and source links.
