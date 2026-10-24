# Google sign-in: proposal

**Status:** proposed, not built yet.
**Goal:** let people keep their presets across browsers and devices, without making sign-in
mandatory.

> Background: today presets belong to an anonymous browser ID. See
> [ARCHITECTURE.md §16.1](ARCHITECTURE.md#161-where-presets-are-saved-and-how-the-server-knows-theyre-yours)
> for how that works and its limits.

---

## 1. Decision

**Add Google sign-in as an optional upgrade, not a login wall.**

- The editor stays usable instantly, with no account, exactly as today.
- Signing in becomes *"sync my presets"*: a button in the Presets tab and the top bar.
- On first sign-in, the browser's anonymous presets **move into the account automatically**, so
  nothing saved earlier is lost.

## 2. Why

### What we gain

| Today (anonymous browser ID) | With Google sign-in |
| --- | --- |
| Presets only in the browser that saved them | Same presets on laptop, phone, any browser |
| Clearing site data or a private window loses access | Sign in again and everything is back |
| The ID works like a password stored in the browser | Google-verified identity; the session can't be read by page scripts |
| No base for social features | Enables share links, a public preset gallery, profiles |

Other reasons:
- **Users:** one tap, no passwords to create, store, hash or reset.
- **Engineering / portfolio:** shows real authentication skills (OAuth, sessions, protected APIs,
  data migration), not just CRUD.

### What it costs

- **Setup:** an OAuth client in Google Cloud Console. Its client ID goes in `.env`.
- **Security surface:** sessions, logout and token verification must be done carefully (see §7).
- **Compliance:** Google requires a **privacy policy** URL before the consent screen can be
  published for public use.
- **Friction, if forced:** a mandatory login before trying the editor would hurt adoption. That's
  why it stays optional.

### Alternatives considered

| Option | Verdict |
| --- | --- |
| Keep anonymous only | Fine for a demo; fails the "my presets on my phone" need. |
| Email + password | More work (hashing, resets, verification emails), worse UX, more liability. |
| Email magic link | Good, but needs an email provider (API key, deliverability). A good *second* option later. |
| **Google sign-in (optional)** | **Chosen:** lowest friction, no passwords to store, official libraries on both sides. |
| Auth platforms (Auth0, Clerk, Firebase Auth) | Faster to start, but a vendor dependency and cost at scale. Overkill for one provider. |

## 3. User experience

```
Anonymous (today)                    Sign in                         Signed in
─────────────────                    ───────                         ─────────
Edit, save presets   ──►  "Sign in with Google  ──►  Google popup  ──►  Avatar in top bar
in this browser            to sync presets"           (one tap)          Presets from every device
                                                                         + this browser's anonymous
                                                                           presets merged in
```

- **Where the button lives:** Presets tab header, plus the rail (desktop) and the top bar (mobile).
- **Signed in:** Google avatar with a menu: *Signed in as name@gmail.com · Sign out*.
- **Sign out:** back to anonymous mode with this browser's ID. Synced presets stay in the account.
- **Errors** (popup blocked, Google down, verification failed) show as a toast; the editor keeps working.

## 4. Architecture

```
Browser                                   EditMate API                          Google
───────                                   ────────────                          ──────
Google Identity Services button
  → user approves  ◄─────────────────────────────────────────────────────────  ID token (JWT)
  POST /api/auth/google { credential } ─►  verifyIdToken(credential)  ───────►  Google public keys
                                           checks: signature, audience = our
                                           client ID, issuer, expiry, email_verified
                                           upsert User by googleSub
                                           merge anonymous presets (X-Client-Id)
                                           create Session (random id, stored hashed)
  ◄─────── Set-Cookie: em_session=…; HttpOnly; Secure; SameSite=Lax
  GET /api/presets (cookie sent automatically) ─►  resolveOwner → user's presets
```

**Key choices**

- **Client:** [Google Identity Services](https://developers.google.com/identity/gsi/web) (the official
  "Sign in with Google" button). It returns an **ID token**. We don't need access to the user's
  Google data, so we never request OAuth scopes beyond identity.
- **Server verification:** [`google-auth-library`](https://www.npmjs.com/package/google-auth-library)
  `OAuth2Client.verifyIdToken({ idToken, audience: GOOGLE_CLIENT_ID })`. **Never trust the token
  without this check.**
- **Sessions: opaque, server-side, revocable.** A random 256-bit session ID goes in an **HTTP-only**
  cookie, and only its SHA-256 hash is stored in MongoDB. Logging out (or "sign out everywhere")
  deletes the row. This is preferred over a long-lived JWT in the browser, which can't be revoked and
  is readable by scripts if stored in localStorage.
- **Same origin:** the client calls `/api` on its own origin (Vite proxies it in dev; serve both
  from one domain in production), so cookies just work and CORS stays strict.

## 5. Data model

### New collection: `users`

```js
{
  _id: ObjectId,
  googleSub: String,      // Google's stable user id (unique index). Never key on email.
  email: String,
  emailVerified: Boolean,
  name: String,
  picture: String,        // avatar URL
  createdAt, updatedAt, lastLoginAt,
}
```

### New collection: `sessions`

```js
{
  _id: ObjectId,
  userId: ObjectId,       // index
  tokenHash: String,      // SHA-256 of the cookie value (unique index); the raw token is never stored
  userAgent: String,
  createdAt: Date,
  expiresAt: Date,        // TTL index: MongoDB deletes expired sessions automatically
}
```

### Change: `presets`

| Field | Today | After |
| --- | --- | --- |
| `clientId` | required | optional (anonymous presets only) |
| `ownerId` | n/a | `ObjectId` of the user (signed-in presets) |
| unique name index | `{ clientId, name }` | partial indexes: `{ clientId, name }` and `{ ownerId, name }`, each case-insensitive |

Exactly one of `clientId` / `ownerId` is set on every preset.

## 6. API

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/api/auth/google` | Body `{ credential }`. Verify the token, upsert the user, merge this browser's anonymous presets, set the session cookie. Returns `{ user, merged: n }`. |
| `GET` | `/api/auth/me` | `{ user }` or `{ user: null }`. The client calls it on load. |
| `POST` | `/api/auth/logout` | Delete the session and clear the cookie. |
| `*` | `/api/presets…` | **Unchanged URLs.** Ownership comes from the session if present, else `X-Client-Id`. |

### The one middleware that changes

Today `requireClientId` sets `req.clientId`. It's replaced by **`resolveOwner`**:

```js
// server/src/middleware/resolveOwner.js
export async function resolveOwner(req, _res, next) {
  const session = await sessions.fromCookie(req);           // null if no or invalid cookie
  if (session) req.owner = { ownerId: session.userId };     // signed in
  else if (isValidClientId(req.get('x-client-id'))) req.owner = { clientId: req.get('x-client-id') };
  else return next(new HttpError(400, 'Missing session or X-Client-Id'));
  next();
}
```

Services take `req.owner` and spread it into every filter, e.g. `Preset.find({ ...owner })`. The
"scoped to owner, others get 404" behaviour carries over unchanged.

### Merging anonymous presets on first sign-in

```js
// inside POST /api/auth/google, after the user is known
const anonymous = await Preset.find({ clientId });
for (const preset of anonymous) {
  preset.name = await uniqueName(user._id, preset.name);   // "Moody" → "Moody (2)" on clash
  preset.ownerId = user._id;
  preset.clientId = undefined;
  await preset.save();
}
```

It's idempotent: once moved, the presets no longer match `{ clientId }`.

## 7. Security checklist

- [ ] **Verify every ID token on the server** with `verifyIdToken`: signature, `aud` equals our client
      ID, `iss` is Google, not expired. Reject `email_verified: false`.
- [ ] **Key users on `sub`, never on email:** emails can change and be reassigned.
- [ ] **Cookie flags:** `HttpOnly` (no JS access), `Secure` (HTTPS only, relaxed on localhost),
      `SameSite=Lax`, `Path=/api`, ~30-day expiry, rotated on login.
- [ ] **Store only a hash** of the session token; compare in constant time.
- [ ] **CSRF:** `SameSite=Lax` blocks cross-site POSTs in modern browsers. Additionally, mutating
      routes check that the `Origin` header matches `CORS_ORIGIN` and require a custom header
      (`X-Client-Id` or `X-Requested-With`), which plain cross-site forms can't send.
- [ ] **Rate-limit** `/api/auth/google` (e.g. 10/min per IP) to slow down token stuffing.
- [ ] **Logout deletes the server session**, not just the cookie.
- [ ] **Never log tokens** or cookie values.
- [ ] **Minimal data:** store only `sub`, email, name and avatar. No Google API access is requested.
- [ ] **Privacy policy page** stating what is stored and how to delete the account (a `DELETE /api/me`
      route that removes the user, their sessions and presets).

## 8. Setup (when we build it)

1. Google Cloud Console → **APIs & Services → Credentials → Create OAuth client ID → Web application**.
2. **Authorised JavaScript origins:** `http://localhost:5173` (dev) and your production origin.
3. Configure the **OAuth consent screen** (app name, support email, privacy policy URL).
4. Add the keys (left blank in the examples, for you to fill in):

   `server/.env`
   ```bash
   GOOGLE_CLIENT_ID=
   SESSION_SECRET=        # long random string, used to sign/rotate session cookies
   ```
   `client/.env`
   ```bash
   VITE_GOOGLE_CLIENT_ID=   # the same client ID; it's public, not a secret
   ```
5. With no `GOOGLE_CLIENT_ID`, the sign-in button is hidden and the app behaves exactly as today
   (the same graceful degradation as running without `MONGODB_URI`).

## 9. Implementation plan

| # | Step | Files |
| --- | --- | --- |
| 1 | `User` and `Session` models with indexes (unique `googleSub`, unique `tokenHash`, TTL `expiresAt`) | `server/src/models/User.js`, `Session.js` |
| 2 | Session service: create, read from cookie, delete; hashing, cookie options | `server/src/services/sessions.service.js` |
| 3 | Auth routes: `/auth/google`, `/auth/me`, `/auth/logout`, with rate limiting | `server/src/routes/auth.routes.js`, `controllers/auth.controller.js` |
| 4 | `resolveOwner` replaces `requireClientId`; services take `owner` | `server/src/middleware/resolveOwner.js`, `services/presets.service.js` |
| 5 | Preset model: optional `clientId`, new `ownerId`, partial unique indexes; merge on sign-in | `server/src/models/Preset.js` |
| 6 | Client: load Google Identity Services, a `useAuth` provider (`me`, `signIn`, `signOut`), send cookies with `credentials: 'same-origin'` | `client/src/state/AuthProvider.jsx`, `lib/api.js` |
| 7 | UI: sign-in button, avatar menu, "synced" state in the Presets tab, toast on merge ("3 presets moved to your account") | `features/presets/PresetsDock.jsx`, `features/rail/*` |
| 8 | Tests (below), then update README and ARCHITECTURE.md | `server/test/auth.test.js` |

## 10. Tests

Server tests run against the in-memory MongoDB, with Google verification **stubbed** (no network):

- A valid token creates the user, sets an `HttpOnly` cookie, and `/auth/me` returns the user.
- An invalid signature, wrong audience, expired token or `email_verified: false` gives `401` and no cookie.
- Signing in again finds the same user by `sub` (no duplicates), even if the email changed.
- **Merge:** anonymous presets move to the account, and name clashes get renamed.
- **Isolation:** user A can't list, update or delete user B's presets (`404`); anonymous and signed-in
  presets never mix.
- **Logout** deletes the session; the old cookie then gets `401` or falls back to anonymous.
- **Expiry:** an expired session isn't accepted.
- **CSRF guard:** a mutating request with a foreign `Origin` is rejected.

## 11. Open questions

- **After sign-out,** should the browser keep a local, read-only copy of synced presets, or start
  empty? (Proposed: start with only this browser's anonymous presets.)
- **Add email magic links later** for people without Google accounts?
- **Session length:** 30 days rolling, or shorter?
- **Account deletion UI:** in a settings menu, or only on request at first?

---

**Next step:** once the open questions are settled and a Google OAuth client ID exists (or with
the variables left blank), implement §9 in order. Each step is independently testable.
