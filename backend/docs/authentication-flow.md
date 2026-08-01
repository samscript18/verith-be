# Authentication Flow

Verith uses short-lived bearer access JWTs and opaque rotating refresh tokens.

1. Registration hashes the password with bcrypt and creates a pending user.
2. A single-use, keyed-hash email token is stored with a TTL. SMTP delivery reports a real provider state.
3. Email verification atomically consumes the token and activates the account.
4. Login creates a session and returns an access token. Browser refresh credentials use an HTTP-only cookie. Explicit mobile clients receive the opaque refresh credential in the response body.
5. Cookie refresh requires the matching CSRF header/cookie. Non-browser clients may submit the refresh token in the body.
6. Refresh atomically replaces the stored keyed hash. Reuse revokes the entire token family.
7. Access-token validation checks the live user state and session revocation state.
8. Logout, password changes, and password resets revoke sessions according to policy.

## Google accounts

`GET /api/v1/auth/google/config` exposes only the public Google web client ID
when `GOOGLE_CLIENT_ID` is configured. The browser obtains a Google Identity
Services ID token and sends it to `POST /api/v1/auth/google` with an explicit
`REGISTER` or `LOGIN` intent. The backend verifies the token signature,
issuer, expiry, audience, subject, and verified-email claim with Google's
official Node.js library before creating a Verith session.

Google registration creates an active `GOOGLE` account keyed by Google's
stable subject identifier; it does not create a password or send a Verith
email-verification token. Google login never creates an account. A normalized
email already owned by a password account cannot be linked or used through
Google, and a Google-created account cannot use password login, reset, or
change flows.

Raw refresh, verification, and reset tokens are never persisted. Password-reset responses are generic to prevent account enumeration.
