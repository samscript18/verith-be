# WhatsApp Setup

WhatsApp Cloud API support is scheduled for Phase 14 and is not active in Phase 1. Set `WHATSAPP_ENABLED=false`.

When implemented, enabling it will require the phone number ID, business account ID, access token, app secret, and verify token. Webhook payloads will require raw-body HMAC verification before any processing. Twilio and unsigned webhook processing are out of scope.
