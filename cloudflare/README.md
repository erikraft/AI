# Cloudflare Workers + Static Assets

This configuration serves the public ErikrafT AI frontend and routes API requests through a Cloudflare Worker. Model weights and GPU inference stay in the Hugging Face Space `ErikrafT/erikraft-ai`; they must never be bundled into the Worker.

## Implemented in this branch

- `POST /api/generate` validates Firebase ID-token signatures against Google's Secure Token JWKS, checks issuer/audience/expiry and permitted sign-in providers, and requires verified email for password accounts.
- Firestore REST transactions reserve up to five generations per account in a rolling hour.
- FLUX text-to-image calls the Gradio `/generate_image` endpoint.
- Qwythos image + instructions uploads the reference image, calls `/generate_image_from_image`, then calls FLUX separately to render the returned prompt.
- Input model, prompt length, image dimensions, steps, request size, and uploaded image type/size are validated.
- Responses are marked `Cache-Control: no-store`.
- Static requests are routed through the Worker. Only the site entrypoint, `/assets/*`, and explicitly listed public root files are served; repository metadata, backend source, and config files return 404.

## Required Cloudflare secrets and variables

Set these under **Workers & Pages → erikraft-ai → Settings → Variables and Secrets → Production**:

| Name | Type | Purpose |
| --- | --- | --- |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Secret | Firebase service-account JSON with least-privilege Firestore access to the generation-limit collection |
| `HF_SPACE_ID` | Variable | `ErikrafT/erikraft-ai` |
| `HF_TOKEN` | Secret (optional) | Only if the Space requires authenticated access |

The service account's `project_id` must match the Firebase project used by the website's ID tokens. Grant only the permissions required for Firestore quota documents. Never commit the JSON or place secrets in browser code.

`HF_SPACE_API_SECRET` is not used by the two enabled image-generation endpoints in this Worker version. Cosmos and Qwen remain unsupported/disabled in this route and must not be enabled by changing browser-side values. Keep their server-side feature gates in place if they are added in a later change.

## Hugging Face Space build/runtime status

A successful Worker deploy does **not** prove that the Space is ready. The Space uses very large third-party model checkpoints, and build/runtime availability depends on the current Space logs, dependency resolution, hardware, cache disk, and provider quota. Confirm the Space is **Running** and successfully test both `/generate_image` and `/generate_image_from_image` in its **Use via API** page before treating generation as production-ready.

This repository branch cannot repair an account-side Hugging Face job timeout without a fresh build log identifying the failing dependency or stage. Do not claim that the timeout is fixed merely because the Worker deploys.

## Deployment

The canonical Wrangler config is `wrangler.jsonc` at the repository root. Workers Builds should run from `/`; leave the build command empty unless a separate build step is introduced, and use `npx wrangler deploy` as the deploy command.

Use a preview hostname first. Firebase ID tokens must be issued for the same Firebase project; the Cloudflare hostname must be allowed by Firebase Authentication's authorized domains where applicable. Test login, quota, both image flows, invalid-token rejection, and static-file 404s before switching production traffic.

## Known limitations / verification still required

- No live end-to-end test was possible as part of this repository change. Verify the Gradio event-stream response format and upload payload against the currently running Space; Hugging Face may change API response formats between Gradio versions.
- Provider failures currently consume the reserved Firestore quota slot until its rolling window resets. A follow-up should implement a transaction-safe quota refund for failed inference calls.
- Concurrent quota reservations rely on Firestore transaction conflict detection; if a transaction conflicts, the request fails closed rather than retrying automatically.
- The Worker supports FLUX and Qwythos image workflows only. Experimental Cosmos video and Qwen text remain unavailable through this endpoint.
- The Space's reported `Build error — Job timeout` must be diagnosed from the latest Hugging Face build logs separately. Large model downloads happen at inference time in the current Space design and are not proof of a successful runtime.
