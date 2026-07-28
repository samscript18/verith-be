# Provider Routing

## AI providers

Phase 5 implements Gemini, Groq, and OpenRouter through one `AiProvider` contract. Models are deployment configuration, never business-logic constants.

- Gemini specializes in image understanding, OCR fallback, audio reasoning, translation, and general structured reasoning.
- Groq is preferred for low-latency structured extraction, claim extraction, classification, summarization, manipulation analysis, and bias analysis.
- OpenRouter is preferred for context analysis, evidence synthesis, report generation, and complex reasoning.

The router filters providers by configuration, capability, configured model, cached live health, and published prompt compatibility. A requested preferred provider is tried first only when it satisfies those constraints.

## Structured output

All provider requests use schema-constrained JSON output. Gemini receives `responseMimeType: application/json` and `responseJsonSchema`. Groq and OpenRouter receive strict `response_format: json_schema`; OpenRouter also receives `require_parameters: true`.

Provider JSON is parsed and validated again with the task's Joi schema. Invalid output is recorded and may receive a bounded corrective retry. A fallback is attempted only after an explicit failure and is identified in the router result.

The wire contracts follow the official [Gemini generateContent API](https://ai.google.dev/api/generate-content), [Groq chat-completions API](https://console.groq.com/docs/api-reference), and [OpenRouter structured-output documentation](https://openrouter.ai/docs/guides/features/structured-outputs).

## Operational records and privacy

`ai_provider_executions` records provider, primary/fallback relationship, model, prompt key/version, schema version, timestamps, latency, token usage, attempt, and safe failure code. It stores only a SHA-256 input fingerprint, never prompts, submitted content, or raw model output. Records expire after `PROVIDER_EXECUTION_RETENTION_DAYS`.

Prompt definitions live in `ai_prompts`. Production resolution accepts only the latest `PUBLISHED` version compatible with the provider and model. Prompt contents are not exposed to normal users.

`GET /api/v1/integrations/ai/health` is restricted to administrators. Health checks use provider model-list endpoints and return explicit provider states. Results are cached for `PROVIDER_HEALTH_CACHE_SECONDS`; `force=true` bypasses the cache.

## Configuration state

A provider is configured only when it has an API key and at least one model. Missing or partial configuration returns `NOT_CONFIGURED`. Authentication, throttling, timeout, and availability failures remain distinct and never produce fabricated output.

External generation checks are opt-in:

```bash
RUN_AI_EXTERNAL_TESTS=true npm run test:external
```

They make small real requests and may incur provider charges.

## Search providers

Phase 7 implements Tavily behind the `SearchProvider` contract. The request
contract supports query, language, country, recency/date bounds, domain
allow/deny lists, result limit, and safe-search intent. Tavily receives only
the options its API supports. Language and safe-search intent remain explicit
in the application contract rather than being falsely represented as native
Tavily controls.

The adapter uses Tavily's official
[Search endpoint](https://docs.tavily.com/documentation/api-reference/endpoint/search)
with bearer authentication. It explicitly sets `include_answer: false` and
`include_raw_content: false`. Search snippets are discovery metadata, not
evidence; the application retrieves each selected page through its SSRF-safe
fetch boundary before creating an available evidence record.

The router retries only timeout and transient availability failures. Missing
configuration, authentication rejection, and rate limiting remain distinct.
`search_executions` stores a SHA-256 query fingerprint, provider request ID,
latency, result/credit counts, and a safe failure code. It does not store the
submitted query.

`GET /api/v1/integrations/search/health` is administrator-only. A forced
Tavily health check performs a real one-result search and therefore consumes a
search credit. Results are cached for `PROVIDER_HEALTH_CACHE_SECONDS`; normal
searches do not incur a separate preflight call.
