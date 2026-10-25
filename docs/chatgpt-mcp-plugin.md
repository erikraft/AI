# ChatGPT MCP integration for ErikrafT AI™

The MCP endpoint at `/api/mcp` exposes public health/model discovery, authenticated generation through the existing `/api/generate` route, and account-owned profile-photo operations through `/api/profile`. The interactive Studio UI is served as `ui://erikraft-ai/studio-v1.html`.

## OAuth 2.0 Authorization Code + PKCE

This branch implements the native OAuth flow intended for ChatGPT:

- Authorization Code grant with PKCE `S256`; no client secret is required for public clients.
- Firebase Authentication handles the user's identity and sign-in (Google and GitHub providers).
- MongoDB Atlas stores OAuth client registrations, short-lived authorization codes, and opaque access-token records. Authorization codes are one-time-use and expire after five minutes; TTL indexes clean up expired records.
- The MCP endpoint validates the opaque bearer token against MongoDB Atlas and verifies the associated Firebase ID token server-side. The Firebase ID token is never a tool argument and is not exposed to the model.
- OAuth discovery is exposed at `/.well-known/oauth-authorization-server` and `/.well-known/oauth-protected-resource`, including the resource-specific metadata path for `/api/mcp`.

The Firebase Web configuration in the login page is public client configuration, not a service-account secret. Keep `FIREBASE_SERVICE_ACCOUNT_JSON`, `MONGODB_URI`, `HF_TOKEN`, and `HF_SPACE_API_SECRET` private and configured only as server-side environment variables.

## Firebase Free and MongoDB Atlas

Firebase Authentication can remain on the Firebase Spark (Free) plan, subject to Firebase provider and usage limits. This implementation does not use Firestore for OAuth state. MongoDB Atlas is the database for OAuth registrations/codes/tokens, consistent with the project's database architecture. OAuth endpoints require the existing `MONGODB_URI`, `MONGODB_DATABASE`, and `FIREBASE_SERVICE_ACCOUNT_JSON` environment variables to be configured on Vercel.

Atlas network access must permit the Vercel function to connect. Do not claim OAuth is live until the deployed endpoint can reach Atlas and the full authorization-code exchange has been tested against ChatGPT's actual OAuth client behavior. No secret values belong in this repository or plugin package.

## Security and release checklist

- Verify the OAuth discovery responses on the deployed domain.
- Test dynamic client registration, Google/GitHub sign-in, PKCE verifier mismatch, redirect URI mismatch, expired/reused codes, expired tokens, and a successful MCP tool call.
- Confirm Firebase authorized domains include the hosted login origin and that the provider sign-in methods are enabled.
- Verify generation/profile APIs still enforce the authenticated UID and server-side quotas.
- Test a real ChatGPT connection before submitting the plugin for public listing.

Do not describe the public integration as production-ready until the live end-to-end tests pass.
