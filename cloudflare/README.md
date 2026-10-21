# Cloudflare Workers + Static Assets

Cloudflare Workers + Static Assets serves the ErikrafT AI frontend. The AI model weights and inference stay in the public Hugging Face Space `ErikrafT/erikraft-ai`.

## Current status: API route is not implemented

The root-level `wrangler.jsonc` configures `cloudflare/worker.js` and routes `/api/*` through the Worker before static asset fallback. In the checked-in implementation, `POST /api/generate` deliberately returns HTTP 503. This fail-closed response is a scaffold, not a working inference API.

The static frontend's image-to-image upload is implemented: it lets the user choose an image file that the browser can decode, normalizes it to JPEG (maximum 3 MiB), and includes it in the authenticated `POST /api/generate` request as `referenceImage`. The Node.js handler in `api/generate.js` converts that image to a Gradio file and calls Qwythos, then invokes FLUX to render the result. **The Cloudflare Worker does not invoke that Node.js handler automatically**, so this file layout does not yet provide a working Cloudflare generation route.

Do not claim end-to-end generation is ready, and do not enable experimental model flags, until the Worker API port and end-to-end tests are completed. The public Hugging Face Space currently reports `Build error — Job timeout`, so the Space build must also be recovered and tested.

## Intended request flow

```text
Browser — Cloudflare Worker + Static Assets
  ├── Firebase Authentication (Google / GitHub / verified email-password)
  └── POST /api/generate + Firebase ID token
        ├── Validate Firebase ID token server-side
        ├── Enforce five generations per account per rolling hour in Firestore
        └── Upload/call Gradio API on ErikrafT/erikraft-ai
              ├── FLUX: text prompt → generated image
              └── Qwythos: uploaded image + instructions → prompt → separate FLUX render
```

The model runtime must never be moved into the Worker or bundled into its static assets.

## Work required before enabling generation

1. Implement Worker-compatible Firebase ID-token validation, including token signature, issuer, audience, expiry, project, and sign-in-provider checks.
2. Port the Firestore transaction that reserves a generation slot, enforces the account limit, and safely refunds the reservation after a failed model call.
3. Implement the Hugging Face Gradio request flow, including image upload for `referenceImage`, async prediction/event handling, returned file URLs, and request timeouts.
4. Preserve feature gates for Cosmos/Qwen and require `HF_SPACE_API_SECRET` only as a server-side secret when calling their protected Gradio endpoints.
5. Validate HTTP methods, payload sizes, allowed model IDs, prompt length, dimensions, inference steps, quotas, provider responses, and no-store response headers.
6. Test all success/error cases on a temporary Workers hostname before routing production traffic to the Worker.

## Cloudflare configuration

The canonical Wrangler configuration is `wrangler.jsonc` at the repository root; Workers Builds runs commands from the repository root. A temporary preview can be exercised with:

```bash
npm install
npx wrangler preview
```

Deploying the current scaffold will still return 503 for `POST /api/generate`. Do not use a production deployment as an inference backend until the route above has been implemented and verified.

The Worker-compatible API will require server-side credentials selected for the implementation, such as a least-privilege Firebase/Firestore credential, `HF_SPACE_ID=ErikrafT/erikraft-ai`, and optionally `HF_TOKEN` if the Space needs authenticated access. The protected Cosmos/Qwen endpoints additionally require the same random `HF_SPACE_API_SECRET` (at least 32 characters) in Cloudflare server-side secrets and the Space secrets. Never put these values in the browser, HTML, `VITE_*` variables, or source control. The current Worker scaffold does not yet consume them for inference.

Firebase OAuth domains must include the relevant Cloudflare production/preview hostnames before sign-in is tested there.

## Required pre-production checklist

- [ ] Unauthenticated or invalid-token calls return 401/403 and never reach inference.
- [ ] Google, GitHub, and verified email/password sign-ins work.
- [ ] Concurrent requests cannot exceed five generations per account per rolling hour.
- [ ] Failed provider requests refund quota only when the same quota window is still active.
- [ ] FLUX text-to-image returns a usable image URL.
- [ ] Qwythos requires a valid image, sends the normalized image file to Qwythos, interprets the instructions, then invokes FLUX.
- [ ] Browser upload accepts browser-decodable image formats, rejects non-images/oversized inputs, and normalizes the payload to at most 3 MiB JPEG.
- [ ] Cosmos and Qwen remain blocked unless server-side flags/resources and the shared secret have been validated.
- [ ] Unsupported models, dimensions, steps, prompts, and oversized payloads are rejected.
- [ ] Hugging Face errors are distinguished from the site's Firestore quota.
- [ ] Browser download works with real Space responses.
- [ ] Static assets do not expose repository files, server code, or secrets.
- [ ] Both Cloudflare preview and production behaviors are explicitly tested; custom-domain traffic is not switched until all tests pass.

## Status

- [x] Add a dedicated Worker entrypoint and root-level Wrangler configuration.
- [x] Route API paths through the Worker before static asset fallback.
- [x] Keep the Worker fail-closed until the API port is complete.
- [ ] Implement Worker-compatible Firebase token validation.
- [ ] Implement Firestore transactional quota enforcement/refund.
- [ ] Implement/test the Gradio image upload and inference flow.
- [ ] Implement/test `/api/models` feature availability.
- [ ] Recover the current Hugging Face Space build and validate real inference.
- [ ] Run end-to-end tests and review logs.
- [ ] Switch production traffic only after verification.
