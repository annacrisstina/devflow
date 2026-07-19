# @devflow/contract

Type-only contract between the API and its consumers: `/api/v1` request/response DTOs (`./api`) and, from M4's live feed onward, the real-time event envelope. This package is why `apps/web` and `apps/api` can share one source of truth for wire shapes without importing each other (apps never import apps).

**Boundaries:** no runtime code, no dependencies, no imports from other workspace packages. Ids that are bigints in the database travel as strings; timestamps are ISO-8601 strings. If a type needs a function or a constant with behavior, it belongs in the app that owns the behavior, not here.
