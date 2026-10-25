# ChatGPT MCP integration for ErikrafT AI™

This branch adds `/api/mcp`, a stateless JSON-RPC MCP endpoint intended for ChatGPT and compatible MCP Apps hosts. It exposes public health/model discovery, authenticated multimodal generation through the existing `/api/generate` route, and account-owned profile-photo operations through `/api/profile`. The interactive studio includes Qwen Image 2.1 Turbo and disables experimental models that `/api/models` reports as unavailable. Token-bearing tools are restricted to the app UI instead of being directly model-callable. The `erikraft_ai_studio` tool returns an interactive UI resource.

## Important authentication limitation

The website's generation and profile APIs currently authenticate with Firebase ID tokens. This initial MCP endpoint accepts a short-lived token for those calls; the Studio UI has a password-type field and does not persist it. It does **not** implement a native OAuth sign-in/authorization-code flow for ChatGPT yet. Do not describe the integration as one-click sign-in until that flow is implemented and tested.

For a production public release, implement OAuth with PKCE and a secure session/token exchange rather than asking users to paste tokens. Never put Firebase service-account JSON, `HF_TOKEN`, `HF_SPACE_API_SECRET`, or `MONGODB_URI` in plugin files or client-side code.

## MongoDB Atlas

This endpoint does not offer arbitrary database queries or Atlas administration. Profile photo tools call the existing authenticated `/api/profile` route, which stores custom/disabled photo state in the `profile_photos` collection. The Qwen custom-MCP feature uses the existing `qwen_mcp_servers` collection. Atlas must be tested through the deployed site's server-side connection; a public health response only reports configuration flags and explicitly reports `databaseConnectionTested: false`.

## Deployment and verification

1. Review and merge the branch.
2. Deploy the repository to Vercel. `api/mcp.js` has a 300-second function ceiling because it proxies long-running generation. Verify `https://ai.erikraft.com/api/mcp` handles MCP `initialize`, `tools/list`, `resources/list`, and `resources/read`.
3. Connect the plugin to `https://ai.erikraft.com/api/mcp` using Streamable HTTP and verify the UI renders.
4. With a test account, verify image, text, video, voice, and profile-photo flows individually. Experimental video/text models can fail due to GPU, disk, queue, or provider limits.
5. The token field is a temporary bridge, not a suitable public sign-in flow. Keep this PR in draft until native OAuth/PKCE is implemented and tested. Never ask the model to collect a token. Test the Atlas-backed profile route end to end before claiming MongoDB operations work.

The API keeps generation quotas in the existing backend and does not bypass them. The voice-reference validator enforces the same 10–60 second range described in the studio UI.
