# AI Provider Routing and Review-Period Capacity

## Architecture

Verith keeps one `AiProvider` contract and one capability router. Gemini Direct,
Groq, OpenRouter, Google Vertex AI, and Amazon Bedrock all normalize into the
same provider result and then pass the same Joi/domain validation. Tavily and
Wikipedia remain evidence discovery providers; model output never becomes
evidence by itself.

Vertex and Bedrock are reliability layers, not a migration and not speculative
parallel requests. Each capability selects one eligible provider, records the
attempt, classifies failure, and may call one different provider sequentially.
Video is deliberately limited to one provider call.

## Default capability routes

| Capability | Default eligible order | Maximum calls |
| --- | --- | ---: |
| Claim extraction | Vertex → Bedrock → Groq → Gemini Direct → OpenRouter | 2 |
| Other structured extraction | Groq → Gemini Direct → Vertex → Bedrock → OpenRouter | 2 |
| Evidence/context analysis | Vertex → Bedrock → Gemini Direct → OpenRouter | 3 |
| Report generation | Vertex → Bedrock → OpenRouter → Gemini Direct | 2 |
| Report localization | Vertex → Bedrock → Groq → Gemini Direct → OpenRouter | 2 |
| Image/screenshot/OCR | Vertex → Gemini Direct → OpenRouter | 2 |
| Video understanding | Vertex, or Gemini Direct when Vertex is not enabled | 1 |
| Audio reasoning | Existing Gemini path; Groq transcription remains separate | 1 |
| Daily Practice | Groq → Gemini Direct → Vertex → OpenRouter → deterministic bank | 2 |

The route is filtered by runtime provider eligibility, adapter capability,
configured model, published prompt compatibility, and budget mode. An optional
`AI_CAPABILITY_ROUTES_JSON` object can override individual routes in staging or
production without adding scattered conditionals. The administrative legacy
default order remains a fallback only for future capabilities without an
explicit route.

Claim extraction deliberately keeps Vertex and Bedrock within its two-attempt
window. Production evidence showed that a Groq failure followed by malformed
Gemini JSON could otherwise end an investigation before either reliability
provider was reached. The claim-output ceiling is 6,000 tokens so a complete
eight-claim schema is not cut off mid-JSON. In conserve/critical budget modes,
the existing budget policy may still move eligible free capacity ahead.

Evidence synthesis is the one three-attempt exception. Its larger analysis
schema receives Vertex and Bedrock first, then one Gemini Direct fallback. Its
10,000-token ceiling matches the service contract so the router does not
silently truncate the structured document. Providers remain sequential and the
router stops after the first validated result.

## Failure and retry policy

Provider calls are classified as authentication, rate-limit/quota, temporary,
invalid request, invalid response, billing, or unknown failures.

- Authentication failures disable the affected direct-provider credential;
  another legitimately issued credential or the next provider may be used.
- Rate limits cool down the affected key/provider and allow bounded failover.
- Timeouts, network failures, and 5xx failures allow bounded failover.
- Invalid request/schema/model-option failures never rotate through credentials
  for the same provider because another key cannot repair an adapter payload.
- Invalid provider JSON/domain output is rejected before persistence and may
  fall through to one different provider.

There is no provider racing. A normal capability has at most two sequential
calls. The router records the primary provider, fallback destination, attempt,
safe failure code, and failure class.

## Structured output

Gemini Direct uses its JSON schema response configuration. Groq and OpenRouter
use OpenAI-compatible strict JSON schema output. Vertex uses `generateContent`
with a response schema. Bedrock uses the official Converse structured-output
configuration. Every response is parsed into the same internal DTO and then
validated again; fallback providers do not bypass evidence-ID, relationship,
or report-integrity checks.

## Concurrency and queue behavior

BullMQ continues to persist and queue one complete investigation orchestration
job. Verith does not create a Redis job for every AI step. An in-process FIFO
gate additionally enforces both provider-class and capability limits.

Recommended review-period starting values:

```env
AI_TEXT_CONCURRENCY=5
AI_REPORT_CONCURRENCY=2
AI_LOCALIZATION_CONCURRENCY=2
AI_MEDIA_CONCURRENCY=2
AI_AUDIO_CONCURRENCY=2
AI_VIDEO_CONCURRENCY=1
VERTEX_TEXT_CONCURRENCY=4
VERTEX_MEDIA_CONCURRENCY=2
BEDROCK_TEXT_CONCURRENCY=2
GROQ_CONCURRENCY=4
GEMINI_DIRECT_CONCURRENCY=2
```

These ceilings are per worker process. If workers are horizontally replicated,
the effective cloud concurrency is the configured limit multiplied by the
number of worker processes; reduce per-process values or introduce a reviewed
distributed lease before scaling workers.

## Cost telemetry and budget modes

`ai_provider_executions` stores provider/model/capability, latency, attempt,
token usage, estimated USD cost, estimate source, failure class, and fallback
destination. It stores only a SHA-256 input fingerprint—not prompts, submitted
content, raw output, or credentials.

Pricing is environment-owned because models and prices change:

The value is a JSON object keyed by the exact configured model ID. Every value
contains the current `inputUsdPerMillion` and `outputUsdPerMillion` numbers from
that model's official pricing page. Startup rejects missing, invalid, or
all-zero pricing for enabled paid models. A `PROVIDER:*` entry may be
used only when every configured model for that provider truly has the same
price. Cloud invoices remain authoritative.

The application calculates separate Vertex and Bedrock utilization plus an
overall review allocation. Configurable thresholds produce:

- `NORMAL`: reviewed capability routes.
- `CONSERVE`: free/low-cost providers move ahead of paid providers, AI Daily
  Practice is disabled, and the deterministic bank remains active.
- `CRITICAL`: free/low-cost providers are attempted first, paid capacity is
  reserved for investigation-critical work, paid video is restricted, and
  Bedrock is reserved for high-value reasoning.
- `EXHAUSTED`: no ordinary paid-provider calls; free and deterministic paths
  remain available.

The execution-retention window must cover the full review period so budget
history cannot expire while the guard is active. The deployment default is 120
days and may be raised, up to 365 days, with
`AI_EXECUTION_RETENTION_DAYS`.

`GET /api/v1/integrations/ai/capacity` returns the cached budget projection and
current in-process queue to administrators. `GET .../health` remains cached for
five minutes. Vertex validates authentication but reports `CONFIGURED` until
real inference validates model/location access. Bedrock likewise reports
`CONFIGURED` until the first real Converse request validates credentials,
model access, and region, avoiding paid probe calls.

## Vertex authentication and rollout

Use Application Default Credentials on Google Cloud. On another backend host,
store a narrowly scoped service-account JSON object in the host's secret store
as `GOOGLE_CLOUD_CREDENTIALS_JSON`; never commit a credential file. Grant only
Vertex inference permissions needed by the selected models. Configure project,
location, and each capability model explicitly, then enable `VERTEX_AI_ENABLED`.

Before production, confirm the models exist in the chosen project/location,
request quota if necessary, and run controlled text, Spanish, Yorùbá, image,
screenshot, and short-video investigations in staging.

The reviewed starting configuration uses the officially documented
`gemini-2.5-flash` model for all Vertex capabilities and the `global` location.
The Vertex adapter deliberately maps `global` to `aiplatform.googleapis.com`;
regional locations continue using `<location>-aiplatform.googleapis.com`.

Current setup references: [Vertex AI quickstart and ADC](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/start/quickstart),
[Vertex Model Garden](https://cloud.google.com/vertex-ai/generative-ai/docs/model-garden/explore-models),
and [Google Cloud Budget API setup](https://docs.cloud.google.com/billing/docs/how-to/budget-api-setup).

## Bedrock authentication and rollout

The AWS SDK uses its normal credential chain. Prefer an execution IAM role; on
hosts without roles, use secret-managed `AWS_ACCESS_KEY_ID`,
`AWS_SECRET_ACCESS_KEY`, and optional `AWS_SESSION_TOKEN`. Grant only
`bedrock:InvokeModel` for the selected model or inference-profile ARNs. Confirm
model access and region, configure text/reasoning/localization model IDs, then
enable `BEDROCK_ENABLED`.

Current setup references: [Bedrock model and regional availability](https://docs.aws.amazon.com/bedrock/latest/userguide/models.html),
[model-inference IAM prerequisites](https://docs.aws.amazon.com/bedrock/latest/userguide/inference-prereq.html),
and [creating an AWS cost budget](https://docs.aws.amazon.com/cost-management/latest/userguide/create-cost-budget.html).

The reviewed starting model is Claude Haiku 4.5 through the US geographic
inference profile:

```text
us.anthropic.claude-haiku-4-5-20251001-v1:0
```

This model/profile supports the Bedrock Runtime Converse path and the structured
output used by Verith. The `us.` profile is intentional: it provides independent
US cross-region capacity while keeping Bedrock a bounded secondary failover.

## Development environment

Copy `.env.example` to the ignored backend `.env`, preserve the application's
existing database/auth/provider settings, and add the following. Do not put a
service-account JSON or AWS secret in a committed file.

```env
VERTEX_AI_ENABLED=true
VERTEX_PROJECT_ID=<your-google-cloud-project-id>
VERTEX_LOCATION=global
GOOGLE_CLOUD_CREDENTIALS_JSON=
VERTEX_MODEL_TEXT=gemini-2.5-flash
VERTEX_MODEL_REASONING=gemini-2.5-flash
VERTEX_MODEL_LOCALIZATION=gemini-2.5-flash
VERTEX_MODEL_VISION=gemini-2.5-flash
VERTEX_MODEL_VIDEO=gemini-2.5-flash

BEDROCK_ENABLED=true
BEDROCK_REGION=us-east-1
BEDROCK_MODEL_TEXT=us.anthropic.claude-haiku-4-5-20251001-v1:0
BEDROCK_MODEL_REASONING=us.anthropic.claude-haiku-4-5-20251001-v1:0
BEDROCK_MODEL_LOCALIZATION=us.anthropic.claude-haiku-4-5-20251001-v1:0

AI_COST_GUARD_ENABLED=true
AI_REVIEW_PERIOD_START=2026-08-01T00:00:00.000Z
AI_REVIEW_BUDGET_USD=250
VERTEX_REVIEW_BUDGET_USD=220
BEDROCK_REVIEW_BUDGET_USD=30
AI_MODEL_PRICING_JSON={"VERTEX:gemini-2.5-flash":{"inputUsdPerMillion":0.30,"outputUsdPerMillion":2.50},"BEDROCK:us.anthropic.claude-haiku-4-5-20251001-v1:0":{"inputUsdPerMillion":1.10,"outputUsdPerMillion":5.50}}
```

Authenticate locally without copying credential JSON into the repository:

```bash
gcloud auth application-default login
gcloud config set project <your-google-cloud-project-id>
aws configure --profile verith-development
export AWS_PROFILE=verith-development
```

The AWS profile must belong to an IAM principal with only the required Bedrock
inference permission. If only one cloud account is ready, leave the other
provider disabled; the router filters it safely.

## Render production environment

Add the same non-secret values in **Render → backend service → Environment**,
but supply these account-owned secrets separately:

```env
NODE_ENV=production
VERTEX_AI_ENABLED=true
VERTEX_PROJECT_ID=<your-google-cloud-project-id>
GOOGLE_CLOUD_CREDENTIALS_JSON=<single-line-service-account-json>

BEDROCK_ENABLED=true
AWS_ACCESS_KEY_ID=<iam-access-key-id>
AWS_SECRET_ACCESS_KEY=<iam-secret-access-key>
# Only set this for temporary STS credentials:
AWS_SESSION_TOKEN=
```

All safe model, location, concurrency, budget, and pricing values can be pasted
from the development block. Use Render's environment UI or a private environment
group; never commit the secret values to `render.yaml`. After saving, choose
**Save, rebuild, and deploy**, then run one controlled text investigation before
media tests. Keep `AI_VIDEO_CONCURRENCY=1`.

`GOOGLE_CLOUD_CREDENTIALS_JSON` must be the complete JSON object on one line.
Render also supports a secret file, but the current Verith adapter directly
consumes the JSON environment variable, so the environment variable is the
least surprising configuration for this deployment.

Create Google Cloud Billing and AWS Budget alerts independently. Suggested
notifications are 25%, 50%, 75%, 90%, and 100%; alerts do not synchronously stop
usage, so the application guard remains necessary.

## Evidence and deterministic safety

Tavily/Wikipedia discovery, SSRF protection, redirect/DNS validation, bounded
retrieval, and evidence normalization are unchanged. Daily Practice falls back
to the deterministic challenge bank. When every eligible investigation model
is unavailable, Verith returns an honest provider-unavailable state rather than
fabricating a report.
