# ADR-0006: GitHub App, not OAuth App, for the GitHub integration

- **Status:** Accepted
- **Date:** 2026-07-18
- **Deciders:** founder + lead engineer

## Context

DevFlow must receive CI events from repositories it does not own and, in later milestones, read Actions artifacts and write PR check runs. GitHub offers three integration primitives: personal access tokens, OAuth Apps, and GitHub Apps. The choice determines the security model, rate-limit economics, webhook plumbing, and how installation feels to a user — and it is effectively irreversible once users install (migrating an installed base between primitives is a support nightmare).

## Decision

DevFlow integrates as a **GitHub App**.

- Users **install** the app on an account/organization and select repositories; the installation is the unit of access.
- Authentication (from M2 onward) is the app-JWT → short-lived installation token dance; tokens are scoped to one installation's granted permissions and expire in ≤1 hour.
- Webhooks are part of the app itself: one subscription, centrally configured, HMAC-signed with the app's webhook secret — no per-repository hook management.
- Permissions are granular and requested minimally per milestone: M1 ships with Actions:read + Metadata:read only; Checks:write is added in M3 when PR annotation lands, accepting the re-approval prompt that permission changes trigger.

## Alternatives considered

- **Personal access token (PAT)** — the student default, and wrong on every axis: acts as a full user, coarse scopes, one shared rate limit, manual webhook setup per repo, and a leaked PAT compromises the owner's whole account. Fine for scripts; disqualifying for an installable product.
- **OAuth App** — authenticates *users* and acts *as them*: access mirrors whatever the authorizing user can touch (far more than DevFlow needs), tokens don't expire by default, rate limits pool per user, and webhooks still need per-repo registration. OAuth user login for the dashboard is a separate, legitimate need — handled by Auth.js in M4 and deliberately distinct from this integration identity.
- **GitHub App** — wins on scoped-by-installation permissions, short-lived tokens, per-installation rate limits (~5,000 req/h *each* instead of one shared pool — material once artifact downloads start in M2), and native webhook subscription. It is the pattern every serious integration (including the closed-SaaS competitors) uses.

## Consequences

- Correct security posture by construction: least privilege per installation, expiring tokens, no long-lived user credential anywhere in the system.
- Rate-limit economics scale with adoption instead of degrading with it.
- Cost: the auth dance (JWT signing, token exchange, caching with expiry) is real complexity arriving in M2 — accepted, it is exactly the integration engineering this project exists to demonstrate. The app private key becomes the system's crown jewel then; M1 deliberately does not generate it, so until M2 there is no key to protect.
- App creation/registration is a manual founder step (documented in [github-app-setup.md](../github-app-setup.md)); the codebase consumes only the webhook secret in M1.
- A second production app registration (separate from the dev one) will be needed at release; accepted, standard practice.
