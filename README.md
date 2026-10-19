# ErikrafT AI

A prompt-based AI image generation website with a responsive dark interface inspired by the visual language of [ErikrafT Wi-Fi™](https://github.com/erikraft/WiFi). The selected model is **`aoxo/flux.1dev-abliterated`**.

- **Frontend:** static HTML/CSS/JavaScript, deployable on Vercel.
- **Authentication:** Firebase Authentication with Google and GitHub providers.
- **Generation:** Hugging Face Gradio Space running the selected model.
- **Abuse prevention:** Firebase ID-token verification and a Firestore-backed limit of five generation requests per account per hour.
- **Cost goal:** use free tiers where possible. Provider quotas, availability, model compatibility, and GPU access are not guaranteed.

## Architecture

```text
Browser
  ├── Firebase Authentication (Google / GitHub)
  └── POST /api/generate + Firebase ID token
          ├── Verify token with Firebase Admin
          ├── Reserve a per-user quota slot in Firestore
          └── @gradio/client → Hugging Face Space
                                  └── aoxo/flux.1dev-abliterated
```

Vercel serves the frontend and API proxy. It does **not** load PyTorch or FLUX weights; the model needs compatible GPU infrastructure.

## Repository layout

- `index.html` — responsive image studio and sign-in modal.
- `assets/css/styles.css` — dark, blue-accented styling inspired by the ErikrafT Wi-Fi design language.
- `assets/js/app.js` — Firebase sign-in, prompt form, API request, result preview, and download.
- `assets/js/firebase-config.js` — Firebase Web app configuration used by the browser.
- `assets/js/firebase-config.js.example` — template for reference.
- `api/generate.js` — authenticated generation endpoint and Firestore quota enforcement.
- `app.py` and `requirements.txt` — Gradio Space entry point and Python dependencies.
- `vercel.json` — static-site response headers.

## 1. Firebase configuration

The frontend is configured for the Firebase Web app in project `erikraft-account`. The public Web configuration is in `assets/js/firebase-config.js` and is loaded by `index.html` before `app.js`.

Firebase Web config values (including `apiKey`, `authDomain`, `projectId`, and `appId`) identify the client application; they are **not** service-account credentials. Keep the following secrets out of the repository and browser code:
- GitHub OAuth Client Secret
- Firebase Admin service-account JSON/private key
- Hugging Face access tokens and other server secrets

In Firebase Console:

1. In **Authentication → Sign-in method**, enable **Google** and **GitHub**.
2. Configure the GitHub OAuth Client ID and Client Secret in Firebase. Use the exact callback URL Firebase shows for the provider.
3. Add the production and preview domains in **Authentication → Settings → Authorized domains**.
4. Create a Firestore database.
5. Configure appropriate Firebase API-key restrictions and Firestore security rules.

The current static frontend imports the modular Firebase SDK from Google's official browser CDN modules. **You do not need `npm install firebase` for the current frontend.** Running `npm install` installs the server dependencies declared in `package.json`, including `@gradio/client` and `firebase-admin`.

## 2. Hugging Face Space

The root `app.py` targets `aoxo/flux.1dev-abliterated`. Create a Space configured for Gradio and select eligible ZeroGPU/free hardware if available. Test an actual generation in the Space before connecting the website. FLUX is a large model and may exceed free hardware limits; GPU access, queue times, quotas, memory, and model compatibility are controlled by Hugging Face. Free and unlimited inference is not guaranteed.

The Space endpoint used by `@gradio/client` is `/generate_image`, with inputs in this order: prompt (string), width (integer), height (integer), steps (integer). If the Space is hosted in another repository, set `HF_SPACE_ID` to its `owner/space-name` and ensure the app exposes the same endpoint and inputs.

## 3. Deploy to Vercel

Import the repository into Vercel. The root is a static site and `api/generate.js` is a Node.js serverless function. Under **Project → Settings → Environment Variables**, configure:

| Variable | Required | Description |
|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Yes | Full Firebase Admin service-account JSON; store only as a server secret |
| `HF_SPACE_ID` | Yes | Hugging Face Space ID in `owner/space-name` format |
| `HF_TOKEN` | If private/gated access is needed | Hugging Face access token; keep server-side |

Use a service account with only the permissions needed for the API. Redeploy after changing environment variables. Never expose service-account JSON or tokens through frontend variables.

Install the server dependencies with:

```bash
npm install
```

No frontend build step is required for the static HTML app.

## 4. Limits and abuse prevention

- Requests without a valid Firebase ID token are rejected.
- Default quota: **5 generation requests per authenticated account per rolling hour**.
- Firestore transactions reserve quota slots across concurrent serverless invocations.
- A slot is reserved before contacting the model provider, so failed provider calls may consume a slot.
- Account-based limits cannot fully prevent users from creating multiple accounts. Consider Firebase App Check and monitoring before public launch.
- Generated image URLs may be temporary. Avoid sending personal or confidential information in prompts.

## 5. Model and readiness

Review the model card and upstream FLUX.1-dev terms before commercial use; do not assume the model metadata alone settles licensing.

**The code is not a verified production deployment.** The site is not ready for end-to-end use until Firebase Authentication and Firestore, a compatible Hugging Face Space, and Vercel environment variables are configured and an actual image generation has been tested.
