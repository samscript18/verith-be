# API Conventions

The global prefix is `/api/v1`. Successful HTTP responses use:

```json
{
  "success": true,
  "message": "Request completed successfully",
  "data": {},
  "meta": { "requestId": "req_...", "timestamp": "ISO-8601" }
}
```

Errors use the same metadata and a stable `error.code`. Every request receives `X-Request-Id`. Client-provided IDs are accepted only when they match the configured safe character and length policy.

DTO validation strips no unknown values silently: unknown properties are rejected. Pagination for high-growth collections will use stable cursor keys.

Administrative mutations require an explicit reason and create an append-only
audit record. Administrative projections exclude credentials, tokens,
verification input, and raw provider responses. See
[`admin-and-analytics.md`](./admin-and-analytics.md).
