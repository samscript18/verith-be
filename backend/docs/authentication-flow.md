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

Raw refresh, verification, and reset tokens are never persisted. Password-reset responses are generic to prevent account enumeration.
