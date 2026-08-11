# Uploads and Cloudinary

## Contract

Uploads use a two-step, authenticated flow. `POST /api/v1/uploads/signature` creates a pending media record and returns owner-bound Cloudinary parameters. After the client uploads directly to Cloudinary, `POST /api/v1/uploads/confirm` verifies the response signature and retrieves authoritative asset metadata through Cloudinary's Admin API.

Avatar clients may use:

- `POST /api/v1/users/me/avatar/upload-signature`
- `POST /api/v1/users/me/avatar/confirm`

Confirmation updates the user's avatar URL and marks the asset attached. Generic retrieval and deletion use `GET/DELETE /api/v1/uploads/:id`.

## Security and validation

- All routes require a valid access token.
- Public IDs contain the owner and a random component but are not treated as authorization.
- Signed context binds the MongoDB asset ID and owner ID to the provider asset.
- Confirmation checks the Cloudinary response signature, provider resource, owner context, asset context, version, format, and byte limit.
- Client-supplied MIME type, size, URL, and dimensions are ignored.
- Asset lookup deliberately returns the same not-found response for nonexistent and foreign assets.
- Attached assets cannot be removed through the generic deletion route.

Image assets accept `jpg`, `jpeg`, `png`, `webp`, `gif`, and `avif` up to 10
MiB. Audio assets accept `mp3`, `wav`, `m4a`, `ogg`, `webm`, and `flac` up to
25 MiB. Verification video accepts `mp4` and `webm` up to 12 MiB and 60
seconds. The backend re-checks authoritative Cloudinary byte, format, and video
duration metadata during confirmation; browser checks are only early feedback.

## Configuration and provider states

`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` are an all-or-none group. The application can start without them so non-upload capabilities remain available. Upload operations then fail explicitly with `CLOUDINARY_NOT_CONFIGURED`; no signature or asset result is fabricated.

Deletion succeeds only after Cloudinary returns an acknowledged result. Provider lookup, response, and deletion failures are normalized to stable 503 errors. Pending cleanup failures remain pending, receive a safe failure code, and are retried on a later hourly run.

## Persistence

The `media_assets` collection stores owner, type, provider public ID, resource type, verified metadata, lifecycle status, attachment, and retention fields. It has indexes for unique provider public IDs, owner history, status operations, and pending expiration scans. Binary media and raw provider responses are not stored.

The cleanup schedule runs inside the API process in this phase. A later production topology may move maintenance work to a dedicated scheduler without changing the lifecycle contract.
