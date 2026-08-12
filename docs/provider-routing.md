# Provider Routing

## AI providers

Phase 5 implements Gemini, Groq, and OpenRouter through one `AiProvider`
contract. Verith pins no-cost defaults in code so deployments need only API
keys:

- Gemini uses `gemini-3.5-flash` for text, image, OCR, and audio reasoning.
- Groq uses `openai/gpt-oss-120b` for text and
  `whisper-large-v3-turbo` for transcription.
- OpenRouter uses concrete zero-price models instead of the random free-model
  router: Nemotron 3 Super for reasoning and reporting, and Gemma 4 for image
  fallback. Model selection is owned in code so deployments only configure
  provider credentials.

The router filters providers by configuration, capability, configured model, cached live health, and published prompt compatibility. A requested preferred provider is tried first only when it satisfies those constraints.

Daily Practice uses `DAILY_CHALLENGE_GENERATION`. Gemini, Groq, and OpenRouter
advertise this capability; the existing configured order chooses candidates.
One request generates all ten questions, and the caller caps the route at two
provider calls with schema-correction retries disabled. Provider or content
failure therefore falls to at most one alternate provider and then the
deterministic bank. Tavily is not a Daily Practice question generator.

## Structured output

All provider requests use schema-constrained JSON output. Gemini receives `responseMimeType: application/json` and `responseJsonSchema`. Groq and OpenRouter receive strict `response_format: json_schema`; OpenRouter also receives `require_parameters: true`.

Provider JSON is parsed and validated again with the task's Joi schema. Invalid output is recorded and may receive a bounded corrective retry. A fallback is attempted only after an explicit failure and is identified in the router result.

The `verification.analysis` prompt explicitly excludes verdict, risk, and
confidence from model authority. It returns evidence relationships and textual
findings only; stored IDs and offsets are revalidated before deterministic
application calculations.

Gemini image analysis uses an inline image part plus a schema-constrained text
instruction. If Gemini is unavailable, OpenRouter receives the image as a data
URL and uses its configured multimodal model. Short-video
understanding uses Gemini inline video with a 12 MiB/60-second application
boundary and has no silent provider fallback. Groq
transcription is a separate speech-to-text adapter rather than a text-reasoning
capability. Its official
[speech-to-text contract](https://console.groq.com/docs/speech-to-text) supplies
verbose segment metadata. Gemini inline requests follow the official
[image-understanding contract](https://ai.google.dev/gemini-api/docs/generate-content/image-understanding)
and [video-understanding contract](https://ai.google.dev/gemini-api/docs/video-understanding).

The wire contracts follow the official [Gemini generateContent API](https://ai.google.dev/api/generate-content), [Groq chat-completions API](https://console.groq.com/docs/api-reference), and [OpenRouter structured-output documentation](https://openrouter.ai/docs/guides/features/structured-outputs).

## Operational records and privacy

`ai_provider_executions` records provider, primary/fallback relationship, model, prompt key/version, schema version, timestamps, latency, token usage, attempt, and safe failure code. It stores only a SHA-256 input fingerprint, never prompts, submitted content, or raw model output. Records expire after the code-defined 30-day retention period.

Prompt definitions live in `ai_prompts`. Production resolution accepts only the latest `PUBLISHED` version compatible with the provider and model. Prompt contents are not exposed to normal users.

`GET /api/v1/integrations/ai/health` is restricted to administrators. Health checks use provider model-list endpoints and return explicit provider states. Results are cached for five minutes; `force=true` bypasses the cache.

## Configuration state

A provider is configured only when it has an API key and at least one model. Missing or partial configuration returns `NOT_CONFIGURED`. Authentication, throttling, timeout, and availability failures remain distinct and never produce fabricated output.

External generation checks are opt-in:

```bash
RUN_AI_EXTERNAL_TESTS=true npm run test:external
```

They make small real requests and consume provider free-tier quota. Keys must
belong to free-tier projects without billing enabled.

## Search providers

Phase 7 uses two search providers in a code-defined order:

1. Tavily searches current web sources and returns ranked titles, URLs, and
   discovery snippets when `TAVILY_API_KEY` is configured.
2. Wikipedia REST search supplies reference material when Tavily is not
   configured, is unavailable, or returns no results.

Search snippets are discovery metadata, not evidence; the application retrieves
each selected page through its SSRF-safe fetch boundary before creating an
available evidence record. Tavily is optional so an absent key produces an
explicit `NOT_CONFIGURED` health state and preserves the Wikipedia fallback.

The router retries only timeout and transient availability failures. Missing
configuration, authentication rejection, and rate limiting remain distinct.
`search_executions` stores a SHA-256 query fingerprint, provider request ID,
latency, result/credit counts, primary/fallback relationship, and a safe
failure code. It does not store the submitted query.

`GET /api/v1/integrations/search/health` is administrator-only. Results are
cached for five minutes; normal searches do not incur a separate preflight
call or consume an additional Tavily credit.
