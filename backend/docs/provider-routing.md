# Provider Routing

Provider routing begins in Phase 5. Gemini, Groq, OpenRouter, search, transcription, reverse-image, Cloudinary, mail, and WhatsApp integrations will expose explicit configuration and health states.

Routes will select providers by capability, modality, health, timeout, cost, retry state, and structured-output support. A fallback is recorded, never silent. Secrets remain in deployment configuration and are redacted from logs.
