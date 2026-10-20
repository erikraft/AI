# Cloudflare Workers + Assets migration

This directory is a **migration scaffold, not a production replacement** for Vercel yet. It deliberately returns HTTP 503 for `POST /api/generate` until the Firebase verification, Firestore quota, and Hugging Face adapters have been ported and tested. Do not attach `ai.erikraft.com` to this Worker at this stage.

## Target architecture

```text
Browser — Cloudflare Worker + Static Assets
  ├── Firebase Authentication (Google / GitHub / verified email-password)
  └── POST /api/generate + Firebase ID token
        ├── Validate Firebase ID token server-side
        ├── Enforce five generations per account per rolling hour in Firestore
        └── Call the existing Gradio API on ErikrafT/erikraft-ai
              ├── FLUX text-to-image
              └── Qwythos reference image + instructions → FLUX render
```

The model weights and GPU inference remain in the Hugging Face Space. The Worker must not download or bundle model weights.

## Why the API port is a separate step

The current Vercel function depends on `firebase-admin` and `@gradio/client`. Those Node-oriented SDKs should not be copied into a Worker and assumed to work unchanged. The port needs Worker-compatible implementations for:

1. Firebase ID-token signature, issuer, audience, expiry, and provider validation.
2. Firestore-backed atomic quota reservation and safe quota refund on failed inference.
3. Gradio API calls for both model workflows, including the reference-image upload path.
4. Request size limits, timeouts, error mapping, and no-store responses.

Until all four are implemented and tested, the current Vercel API remains the working backend. This scaffold fails closed rather than accidentally allowing unauthenticated generations.

## Cloudflare setup (after the API port is ready)

1. Install Node.js 20+ and Wrangler in a local clone.
2. From the repository root, run `npx wrangler deploy --config cloudflare/wrangler.jsonc` only after completing the API port and tests.
3. Configure server-side secrets through Wrangler/Cloudflare, never in the frontend or Git:
   - `FIREBASE_SERVICE_ACCOUNT_JSON` (or the final least-privilege credential format selected by the implementation)
   - `HF_TOKEN` only if the Space requires authenticated access
   - `HF_SPACE_ID=ErikrafT/erikraft-ai`
4. Verify Firebase Authentication authorized domains include the Worker preview hostname.
5. Run the test checklist below on the temporary `workers.dev` hostname.
6. Only after passing all checks, configure the custom domain and switch DNS/traffic.

Do not commit credentials, service-account JSON, private keys, or Hugging Face tokens. The Firebase Web configuration used by the browser is public client configuration and is not a substitute for server credentials.

## Required pre-production test checklist

- [ ] Unauthenticated `POST /api/generate` returns 401.
- [ ] Expired, malformed, wrong-project, and invalid-signature Firebase tokens are rejected.
- [ ] Google and GitHub sign-in can generate; unverified email/password accounts are rejected.
- [ ] Six concurrent requests for one account cannot exceed the five-request quota.
- [ ] A failed provider request refunds its quota reservation when safe to do so.
- [ ] FLUX text-to-image returns a usable image URL.
- [ ] Qwythos requires a PNG/JPEG/WebP reference image no larger than 3 MiB, interprets instructions, and then invokes FLUX.
- [ ] Unsupported model IDs, image types, dimensions, steps, and oversized prompts are rejected.
- [ ] Hugging Face errors are distinguished from the site's Firestore quota.
- [ ] Browser download works with the actual Space response.
- [ ] Static assets do not expose repository files, source secrets, or backend code.
- [ ] Firebase OAuth works on the temporary hostname before changing the production domain.

## Current status

- [x] Add a dedicated Worker entrypoint and configuration.
- [x] Route API paths through the Worker before static asset fallback.
- [x] Keep the current Vercel deployment untouched.
- [ ] Implement Worker-compatible Firebase token validation.
- [ ] Implement Firestore transaction/quota adapter.
- [ ] Implement and test both Hugging Face Gradio workflows.
- [ ] Run end-to-end tests and review logs.
- [ ] Deploy to a temporary Worker hostname and validate.
- [ ] Switch the custom domain only after verification.
