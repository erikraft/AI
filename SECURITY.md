# Security Policy

## Reporting a Vulnerability

Please do not disclose security vulnerabilities in public issues, discussions, pull requests, or other public channels.

If GitHub's private vulnerability reporting is enabled for this repository, use **Security → Advisories → Report a vulnerability** to contact the maintainers privately. Otherwise, contact the repository owner privately through GitHub and include only the information needed to reproduce and assess the issue.

Please include:
- A concise description of the issue and its potential impact.
- Affected files, endpoints, or commit/branch, if known.
- Reproduction steps or a proof of concept that does not expose real user data.
- Any suggested mitigation.

Do not include real credentials, access tokens, personal data, or production user data in a report. Please allow time for investigation and a fix before public disclosure.

## Secrets and Configuration

Never commit server-side credentials or private keys. This includes Firebase Admin service-account JSON, Hugging Face write/access tokens, private keys, passwords, and deployment secrets. Store them in the appropriate secret manager or deployment environment, grant least-privilege access, and rotate them if they may have been exposed.

The Firebase **Web** configuration in `assets/js/firebase-config.js` is delivered to browsers. Its Firebase Web API key is a client identifier, not an authorization mechanism or a server-side secret; moving it to frontend environment variables does not make it secret because the browser must receive it. Access control must be enforced with Firebase Authentication, Firestore Security Rules, and server-side authorization.

However, a publicly visible Google API key must still be reviewed. In Google Cloud Console:
1. Open **APIs & Services → Credentials** for the `erikraft-account` project.
2. Confirm which APIs the key is allowed to call and restrict it to only the APIs the application needs.
3. For browser usage, configure appropriate website/referrer restrictions for the deployed site and any required local development origins.
4. Review API usage and logs for unexpected activity.
5. If the key has inappropriate permissions, was used outside its intended scope, or shows suspicious use, rotate or replace it, update the Firebase Web configuration, verify the application, and revoke the old key.

Do not revoke or replace a Firebase Web API key blindly: first confirm the impact and update the application configuration so legitimate Firebase clients are not unexpectedly broken. Restrictions and Firebase Security Rules are essential; the key itself does not protect data.

## Exposed Credential Response

If a genuine secret is exposed:
1. Revoke or rotate it at the issuing provider immediately.
2. Update the affected deployment secrets and verify dependent services.
3. Review provider audit logs and usage for unauthorized access.
4. Remove the credential from tracked files and prevent recurrence.
5. Resolve the corresponding GitHub secret-scanning alert only after the provider-side response is complete.

Removing a value from the latest commit or adding this policy does not invalidate a credential and does not erase it from Git history. Treat exposed server credentials as compromised until verified otherwise.

## Scope

This policy covers the ErikrafT AI repository and its application code. It does not replace the security controls or reporting procedures of Firebase, Google Cloud, Hugging Face, Vercel, or other service providers.
