# Security Policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Report vulnerabilities privately via [GitHub Security Advisories](../../security/advisories/new) (preferred) or by email to <rohike.contact@gmail.com> with subject `[SECURITY] DevFlow`.

You can expect an acknowledgement within **72 hours** and a status update within **7 days**. Please include reproduction steps and the affected component; a proof of concept helps but is not required.

## Supported versions

DevFlow is pre-1.0. Only the latest commit on `main` receives security fixes.

## Scope notes

DevFlow processes GitHub webhook payloads and repository metadata on behalf of its users. Reports involving webhook signature bypass, OAuth/GitHub App token handling, or cross-tenant data access are considered highest severity.
