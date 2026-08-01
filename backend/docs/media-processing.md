# Media Processing

## Trust boundary

Only confirmed assets already attached to the verification are processed. The
stored delivery URL must use HTTPS, the exact `res.cloudinary.com` host, and
the configured Cloudinary cloud-name path. Media downloads reject redirects,
unexpected content types, timeouts, and configured or Gemini inline-size
limits.

## Images and screenshots

Gemini image understanding receives the image as inline bytes using the
official `inlineData` multimodal request shape. Its schema-constrained result
extracts visible text, lines, language, uncertain regions, dates, URLs,
publisher marks, likely content type, and possible cropping.

OCR confidence is calculated from whether text exists and the ratio of
uncertain regions to extracted lines; the model does not choose the confidence
number. OCR remains probabilistic and uncertain regions are preserved.

A general vision model is not a specialized synthetic-media detector. The
stored AI-content indicator is therefore `INCONCLUSIVE`, confidence is zero,
and `specializedDetectorUsed` is false. Every analysis includes:

> AI-generated content detection is probabilistic and must not be treated as
> definitive proof by itself.

No reverse-image provider is currently configured. The durable state is
`NOT_CONFIGURED`, matches are empty, and the API never claims an earliest
appearance or silently substitutes search snippets.

## Video

Short MP4 and WebM clips are accepted up to 12 MiB and 60 seconds. The backend
retrieves the confirmed Cloudinary asset through the same trusted-media
boundary and sends it to Gemini as inline video data. This keeps the complete
request below Gemini's inline request limit without introducing a second media
provider.

The structured result keeps spoken text, on-screen text, and timestamped model
observations distinct. Verith deterministically builds the downstream claim
extraction input from those fields; it does not ask the model for a free-form
summary and present that summary as a transcript. No video confidence score is
invented when the provider does not return a calibrated value.

Video analysis samples frames and can miss brief edits, rapid action, small
text, or off-screen context. It is not a forensic deepfake, authenticity, or
identity assessment. These limitations remain attached to the report.

## Audio

Groq speech-to-text uses the real `/audio/transcriptions` endpoint with the
configured transcription model, `verbose_json`, zero temperature, and segment
timestamps. The provider retrieves the already validated Cloudinary URL.

Segments retain start/end times. Where Groq supplies `avg_logprob`, Verith
stores `exp(avg_logprob)` as a bounded quality proxy, not a calibrated
probability of correctness. If quality metadata is absent, confidence remains
unavailable and a limitation is recorded. The transcript then enters the same
language, claim, evidence, and analysis pipeline as text.

`GET /api/v1/verifications/:id/media` is owner-scoped and returns image or
video analysis and/or an audio transcript.
