# Cloudflare Workers + Static Assets

This configuration serves the public ErikrafT AI frontend and routes API requests through a Cloudflare Worker. Model weights and GPU inference stay in the Hugging Face Space `ErikrafT/erikraft-ai`; they must never be bundled into the Worker.

## Implemented in this branch

- `POST /api/generate` validates Firebase ID-token signatures against Google's Secure Token JWKS, checks issuer/audience/expiry and permitted sign-in providers, and requires verified email for password accounts.
- Firestore REST transactions reserve up to five generations per account in a rolling hour.
- `GET /api/models` exposes experimental selectors when the Space ID and server-side `HF_SPACE_API_SECRET` are configured.
- FLUX text-to-image calls the Gradio `/generate_image` endpoint.
- Qwythos image + instructions uploads the reference image, calls `/generate_image_from_image`, then calls FLUX separately to render the returned prompt.
- Cosmos3 Nano text-to-video calls `/generate_video`; the Space enforces `ENABLE_COSMOS_VIDEO`, VRAM and disk checks.
- Qwen3.8 text generation calls `/generate_text`; the Space enforces `ENABLE_QWEN_TEXT`, CPU runtime, RAM and disk checks.
- Input model, prompt length, image dimensions, steps, request size, and uploaded image type/size are validated.
- Responses are marked `Cache-Control: no-store`.
- Static requests are routed through the Worker. Only the site entrypoint, `/assets/*`, and explicitly listed public root files are served; repository metadata, backend source, and config files return 404.

## Required Cloudflare secrets and variables

The production hostname `ai.erikraft.com` is attached to Worker `erikraft-ai` in the **Production** environment. Set these under **Workers & Pages → erikraft-ai → Settings → Variables and Secrets → Production**. A value saved only under another Worker or Preview is not available to this production binding:

| Name | Type | Purpose |
| --- | --- | --- |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Secret | Firebase service-account JSON with least-privilege Firestore access to the generation-limit collection |
| `HF_SPACE_ID` | Variable | `ErikrafT/erikraft-ai` |
| `HF_TOKEN` | Secret (optional) | Only if the Space requires authenticated access |

The service account's `project_id` must match the Firebase project used by the website's ID tokens. Grant only the permissions required for Firestore quota documents. Never commit the JSON or place secrets in browser code.

**Important:** saving a secret in the dashboard is not enough; select **Deploy** to publish a Worker version containing it. The repository's `wrangler.jsonc` declares `FIREBASE_SERVICE_ACCOUNT_JSON` under `secrets.required`, so `wrangler deploy`/Workers Builds will fail clearly if that required secret is absent instead of publishing a version that cannot generate. This declaration records the required *name* only; it does not contain or create the secret value. As an alternative, run `npx wrangler secret put FIREBASE_SERVICE_ACCOUNT_JSON` from the repository root and paste the full service-account JSON only into Wrangler's interactive prompt (never into source control or chat).

`HF_SPACE_API_SECRET` is used only for the protected Cosmos and Qwen endpoints; keep it as a secret in both Cloudflare Worker and the Hugging Face Space. The Worker exposes their selectors when that secret and `HF_SPACE_ID=ErikrafT/erikraft-ai` are configured. The Space still controls runtime availability with `ENABLE_COSMOS_VIDEO` and `ENABLE_QWEN_TEXT`; a visible selector alone does not guarantee inference will succeed.

## Hugging Face Space build/runtime status

A successful Worker deploy does **not** prove that the Space is ready. The Space uses very large third-party model checkpoints, and build/runtime availability depends on the current Space logs, dependency resolution, hardware, cache disk, and provider quota. Confirm the Space is **Running** and successfully test both `/generate_image` and `/generate_image_from_image` in its **Use via API** page before treating generation as production-ready.

This repository branch cannot repair an account-side Hugging Face job timeout without a fresh build log identifying the failing dependency or stage. Do not claim that the timeout is fixed merely because the Worker deploys.

## Deployment

The canonical Wrangler config is `wrangler.jsonc` at the repository root. Workers Builds should run from `/`; leave the build command empty unless a separate build step is introduced, and use `npx wrangler deploy` as the deploy command. The config requires `FIREBASE_SERVICE_ACCOUNT_JSON` and validates that it exists before deployment. It intentionally does not store the secret value.

Use a preview hostname first. Firebase ID tokens must be issued for the same Firebase project; the Cloudflare hostname must be allowed by Firebase Authentication's authorized domains where applicable. Test login, quota, both image flows, invalid-token rejection, and static-file 404s before switching production traffic.

## Known limitations / verification still required

- No live end-to-end test was possible as part of this repository change. Verify the Gradio event-stream response format and upload payload against the currently running Space; Hugging Face may change API response formats between Gradio versions.
- Provider failures currently consume the reserved Firestore quota slot until its rolling window resets. A follow-up should implement a transaction-safe quota refund for failed inference calls.
- Concurrent quota reservations rely on Firestore transaction conflict detection; if a transaction conflicts, the request fails closed rather than retrying automatically.
- The Worker routes FLUX, Qwythos image-to-text-to-image, Cosmos video, and Qwen text. Cosmos and Qwen still depend on Space-side feature flags and resource checks.
- The Space's reported `Build error — Job timeout` must be diagnosed from the latest Hugging Face build logs separately. Large model downloads happen at inference time in the current Space design and are not proof of a successful runtime.
