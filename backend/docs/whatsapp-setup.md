# WhatsApp Cloud API Setup

Verith integrates directly with Meta's Graph API; Twilio is not used.

Configure `WHATSAPP_ENABLED=true` plus the phone number ID, business account ID,
access token, app secret, verify token, API version, HTTPS Graph base URL, and
optional report deep-link base. WhatsApp also requires the Cloudinary
configuration and a `MASTER_ENCRYPTION_KEY` of at least 32 characters.

Register these webhook endpoints in Meta:

- Verification and delivery: `GET /api/v1/whatsapp/webhook`
- Signed events: `POST /api/v1/whatsapp/webhook`

The GET challenge requires the exact verify token. POST requests require
`X-Hub-Signature-256`; Verith calculates HMAC-SHA256 over the preserved raw
request body and compares it in constant time before parsing.

## Account linking

An authenticated user requests `POST /api/v1/whatsapp/link-code`. The returned
code expires after ten minutes and is stored only as a keyed hash. The user sends
`LINK <code>` to the configured WhatsApp number. Verith encrypts the phone
identity using AES-256-GCM, stores a separate keyed lookup hash, records consent,
and consumes the code. Linking never relies on phone-number matching alone.

Users inspect or revoke consent through:

- `GET /api/v1/whatsapp/link-status`
- `DELETE /api/v1/whatsapp/link`

Unlinking removes encrypted and hashed phone linkage values.

## Message processing

Signed text, URL, image, and audio messages are deduplicated by Meta `wamid`,
persisted without message body or plaintext phone number, and queued. Meta media
is downloaded with Bearer authentication, MIME/size validated, and transferred
server-side to Cloudinary before verification creation.

Acknowledgements and cautious completion summaries use the real Graph API.
Delivery callbacks persist sent, delivered, read, and failed timestamps and safe
failure codes. An unconfigured or unavailable provider is never reported as a
successful send.
