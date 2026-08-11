# Verith OpenAPI and Swagger documentation

Verith publishes one OpenAPI contract from the same NestJS metadata used by the
live Swagger UI. Do not hand-edit `openapi.json`.

## Documentation endpoints

When `SWAGGER_ENABLED=true`:

- Swagger UI: `/api/docs`
- OpenAPI JSON: `/api/docs-json`
- OpenAPI YAML: `/api/docs-yaml`

Swagger UI supports filtering, stable alphabetical ordering, request-duration
display, and persisted authorization during local exploration.

## Generate and validate

```bash
npm run openapi:export
npm run openapi:check
npm run openapi:types
```

`openapi:export` is offline-safe. It does not connect to MongoDB, Redis, or an AI
provider and does not run startup seeders or the Daily Practice scheduler.
`openapi:check` regenerates the contract and fails when an operation lacks a
summary, description, tag, access classification, success response schema,
request-body description, parameter description, request ID documentation, or
when a component reference cannot be resolved.

## Authentication

Protected routes use the `bearer` security scheme with a short-lived access
token. Browser refresh uses the `verith_refresh` HttpOnly cookie and the
`X-CSRF-Token` header. Mobile clients may set `X-Client-Type: mobile` to receive
the refresh token in the authentication response payload.

Administrative routes require the role enforced by the corresponding NestJS
controller. Swagger documents these operations as `authenticated-admin`; the
backend guard remains the authorization source of truth.

## Response contract

Normal JSON success responses use:

```json
{
  "success": true,
  "message": "Request completed successfully",
  "data": {},
  "meta": {
    "requestId": "req_01J5F4Y7J8W3K9M2Q6R1T0VABC",
    "timestamp": "2026-08-11T12:00:00.000Z"
  }
}
```

Errors use:

```json
{
  "success": false,
  "message": "Request validation failed",
  "error": {
    "code": "VALIDATION_ERROR",
    "details": null
  },
  "meta": {
    "requestId": "req_01J5F4Y7J8W3K9M2Q6R1T0VABC",
    "timestamp": "2026-08-11T12:00:00.000Z"
  }
}
```

Downloads and server-sent event streams are explicitly marked as raw responses
and do not use the JSON envelope. `204` responses have no body.

## Request correlation and errors

Every operation documents the optional `X-Request-Id` request header and the
same response header. Invalid or missing values are replaced server-side.
Reusable error responses cover validation, authentication, authorization,
missing resources, conflicts, throttling, internal failures, and unavailable
dependencies. Application-specific `error.code` values remain the reliable
client branching mechanism.

## Adding an endpoint

Use accurate DTO validation and add explicit `@ApiOperation`, response types,
examples, or exceptional responses whenever domain-specific detail is known.
The shared enhancer supplies the standard envelope, errors, request ID,
parameter descriptions, and a safe fallback operation description. Hand-authored
Swagger metadata always takes precedence over inferred documentation.

Run `npm run openapi:check` before committing API changes.
