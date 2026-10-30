# I-One API Documentation

## Table of Contents
1. [Base URL & Authentication](#base-url--authentication)
2. [Real-time Updates (SSE) — Frontend Guide](#real-time-updates-sse--frontend-guide)
3. [Health Check](#health-check)
4. [Authentication](#authentication)
5. [Users](#users)
6. [Email Verification](#email-verification)
7. [Verification (KYC)](#verification-kyc)
8. [Locations](#locations)
9. [Owner Dashboard](#owner-dashboard) — includes `/revenue` and `/users-chart`
10. [Sessions](#sessions)
11. [Sets](#sets)
12. [Matches](#matches) — rotation, recording safely on a bad network
13. [Referees](#referees)
14. [Tournaments](#tournaments)
15. [Stats](#stats) — includes the player rating
16. [Voting — Player of the Session](#voting--player-of-the-session)
17. [Badges](#badges)
18. [Captains](#captains)
19. [Wallet & Payments](#wallet--payments) — includes refund flow
20. [Banks](#banks)
21. [Settings](#settings) — platform commission rate, minimum pool contribution
22. [Location Billing](#location-billing) — owner transaction history & team payment validator
23. [Notifications](#notifications)
24. [Admin](#admin) — includes commission summary
25. [Webhooks](#webhooks) — includes refund.* events
26. [Universal / App Links](#universal--app-links)
27. [Error Handling](#error-handling)
28. [Types & Interfaces](#types--interfaces)

---

## Base URL & Authentication

**Base URL**: `https://i-one-server-v1.onrender.com/i-one`

### How Authentication Works
- Login returns an **HTTP-only cookie** (`Authentication=<jwt>`)
- The browser sends the cookie automatically on every subsequent request
- No manual `Authorization` header is required for cookie-based flows
- All protected endpoints require this cookie to be present

### Guards
| Guard | Description |
|---|---|
| `JwtAuthGuard` | Requires a valid JWT cookie |
| `IsOwnerGuard` | Requires `JwtAuthGuard` + `user.isOwner === true` |
| `RolesGuard + @Roles(SUPER_ADMIN)` | Requires `JwtAuthGuard` + `user.role === 'SUPER_ADMIN'` |

---

## Real-time Updates (SSE) — Frontend Guide

The app gets live updates over **Server-Sent Events (SSE)**: a long-lived HTTP `GET` the server keeps open and writes messages to. It's one-way (server → app); everything the app *does* still goes through the normal REST endpoints. This section is the how-to; each stream's own section lists its exact events.

### The streams

| Stream | Open it when | It carries | First message |
|---|---|---|---|
| `GET /notifications/stream` | The user is logged in and the app is in the foreground — **one per app**, always on | Every in-app notification for this user (`type`, `title`, `body`, `payload`) — see the table under [Notifications](#notifications) | `{"type":"connected"}` |
| `GET /matches/stream/:matchId` | A live match screen is open | That match: score changes, start, full time (with the next game), referee changes | `{"type":"connected"}` |
| `GET /matches/stream/session/:sessionId` | A session screen showing its games is open | The same, for every match in the session | `{"type":"connected"}` |
| `GET /matches/stream` | Admin / owner dashboards only — **not** for player screens | The same, for every match | `{"type":"connected"}` |
| `GET /wallet/session/:sessionId/payment-stream` | The pool payment screen is open | The whole pool snapshot on connect, then a fresh snapshot on every change | `{"type":"pool_snapshot"}` |
| `GET /tournaments/stream/:id` | A tournament screen is open | Bracket / fixture / standings changes | `{"type":"connected"}` |

All of them send `{"type":"heartbeat"}` every **30 seconds**.

### Connecting

- **URL**: base URL + path, e.g. `https://i-one-server-v1.onrender.com/i-one/notifications/stream`.
- **Auth**: the same `Authentication` cookie as every other request. There's no token in the URL.
  - **Browser / web view**: `new EventSource(url, { withCredentials: true })` sends the cookie.
  - **Mobile**: phones have no built-in `EventSource`. Use an SSE client library for your framework that lets you **set request headers**, and send `Cookie: Authentication=<jwt>` and `Accept: text/event-stream` yourself.
- **Errors before the stream starts** come back as a normal JSON error (see [Error Handling](#error-handling)), not as stream messages:
  - `401` — not logged in / session expired → send the user to log in; **don't retry**.
  - `403` / `404` — not allowed to watch this, or it doesn't exist → **don't retry**.
  - `429` — too many open streams (10 per user on match streams, 500 viewers per match). If you see this, the app is **not closing streams it no longer needs** — fix that rather than retrying.

### Reading messages

Every message is one `data:` line holding JSON. The server never sends a named `event:` field, so listen to the default message handler (`onmessage`) and branch on the JSON:

```ts
function handle(stream: 'notifications' | 'match' | 'payment' | 'tournament', raw: string) {
  const msg = JSON.parse(raw);

  if (msg.type === 'heartbeat') return markAlive();          // every 30s, all streams
  if (msg.type === 'connected') return onConnected(stream);   // resync from REST here (see below)
  if (msg.type === 'error') return reconnectSoon();          // the server hit a problem with this stream

  switch (stream) {
    case 'notifications': return onNotification(msg);        // msg.type is the notification type
    case 'match':         return onMatch(msg);               // msg.type: score | match_started | match_finished | referee_changed
    case 'payment':       return onPool(msg.snapshot);       // msg.type: pool_snapshot | pool_update
    case 'tournament':    return onTournament(msg);          // msg.event: started | result | advance | scheduled | completed
  }
}
```

### Keeping it alive

```ts
// Framework-neutral sketch. `openSse` is your SSE library's connect call.
const BACKOFF_MS = [1000, 2000, 5000, 10000, 30000];

function keepStreaming(url: string, stream: StreamKind) {
  let attempt = 0;
  let lastSeen = Date.now();
  let conn: SseConnection | null = null;
  let stopped = false;

  const connect = () => {
    conn = openSse(url, {
      headers: { Cookie: `Authentication=${jwt()}`, Accept: 'text/event-stream' },
      onOpen: () => { attempt = 0; lastSeen = Date.now(); },
      onMessage: (raw) => { lastSeen = Date.now(); handle(stream, raw); },
      onError: (status?: number) => {
        conn?.close();
        if (stopped || status === 401 || status === 403 || status === 404) return; // don't retry these
        const wait = BACKOFF_MS[Math.min(attempt++, BACKOFF_MS.length - 1)];
        setTimeout(connect, wait + Math.random() * 500);
      },
    });
  };

  // Heartbeats come every 30s. Nothing for 75s means the connection died
  // without telling us (common on mobile networks): reconnect.
  const watchdog = setInterval(() => {
    if (Date.now() - lastSeen > 75_000) { conn?.close(); connect(); }
  }, 15_000);

  connect();
  return () => { stopped = true; clearInterval(watchdog); conn?.close(); };   // call when leaving the screen
}
```

**Rules:**
1. **Close a stream when its screen closes**, and close all of them when the app goes to the background. Reopen on foreground. Streams left open count against the limits above.
2. **Reconnect with backoff**: 1s, 2s, 5s, 10s, then every 30s, plus a little random delay so every phone doesn't reconnect at the same instant after a server restart. Deploys and restarts drop every connection; this is normal.
3. **Use the heartbeat as a watchdog**: no message at all for 75 seconds means the connection is dead even if the library hasn't noticed — close it and reconnect.

### Match stream events

```ts
function onMatch(msg) {
  switch (msg.type) {
    case 'score':           // replace the score on screen (it's the full score)
      return setScore(msg.matchId, msg.teamOneScore, msg.teamTwoScore, msg.scoreVersion, msg.latestScorer);
    case 'match_started':   // show the match as live
      return setLive(msg.matchId, msg.startedAt);
    case 'match_finished':  // show the result; if msg.next, show the next game (it's SCHEDULED)
      showResult(msg);
      if (msg.next) showNextGame(msg.next);
      return;
    case 'referee_changed': // msg.referee is the new referee's roster entry, or null (no referee)
      return setReferee(msg.matchId, msg.referee);
  }
}
```

### Missed events: always resync from REST

**SSE doesn't replay anything.** Whatever happened while the phone was offline, backgrounded or reconnecting is gone. So every time a stream (re)connects — when `{"type":"connected"}` arrives — reload the screen's state from REST, then apply live messages on top:

| Stream | Reload with |
|---|---|
| `/notifications/stream` | `GET /badges/me` (show any with `seenAt: null`), and whatever the open screen shows (e.g. `GET /votes/:sessionId`) |
| `/matches/stream/:matchId` | `GET /matches/details/:matchId` |
| `/matches/stream/session/:sessionId` | `GET /matches/matchups/:sessionId` |
| `/wallet/session/:sessionId/payment-stream` | Nothing — it sends the full snapshot when it connects |
| `/tournaments/stream/:id` | `GET /tournaments/:id` |

Treat REST as the truth and SSE as "something changed". Score events carry the **whole score**, so replace what's on screen — never add to it. Then a duplicated or out-of-order message can't make the screen wrong.

### Notifications arrive twice — on purpose

Most notifications are sent **both** on `/notifications/stream` and as a **phone push**, so the user hears about them whether or not the app is open. When the app is in the foreground you'll get both; show one. Use the notification `type` plus its `payload` ids (e.g. `BADGE_UNLOCKED` + `badge`, `SESSION_VOTE_OPEN` + `sessionId`) as the key to ignore the second copy.

What to do with each notification type:

| `type` | Do this |
|---|---|
| `REFEREE_INVITE` | Show the invite; accept or decline with `payload.refereeId` (`POST /referees/:refereeId/accept` / `decline`) |
| `MATCH_RESULT_REVIEW` | Open the result review: `GET /matches/details/:matchId` (`payload.matchId`), then confirm or dispute before `reviewUntil` |
| `SESSION_VOTE_OPEN` | Open the vote screen: `GET /votes/:sessionId` |
| `SESSION_VOTE_RESULT` | Reload `GET /votes/:sessionId` — `result` is now filled in |
| `BADGE_UNLOCKED` | Show the badge pop-up, then `POST /badges/:badgeId/seen` with `payload.badgeId` |
| `SESSION_REMINDER`, `SESSION_BROADCAST`, `SESSION_CREATED`, `SESSION_CONFIGURED`, `ADMIN_BROADCAST`, verification types | Show as a banner / in the notification list; refresh the related screen if it's open |

### Recording a match (referee / scoreboard phone)

The phone that **records** the score must not rely on SSE for its own taps:
- Each goal / undo / end request returns the updated match with its new `scoreVersion` — use **that** for the next tap (see *Recording safely on a bad network* under [Matches](#matches)).
- Score events carry the match's new `scoreVersion` too. If one arrives that this phone didn't cause (another phone recorded — possible when a match has no referee), take its `scoreVersion` for the next tap. If a tap is answered `409` anyway, the body's `details` has the current score and version.
- **`referee_changed`**: if this phone was recording and `msg.referee` isn't its referee entry any more (handed off or removed), switch the screen out of recording mode — the server now refuses its taps (`403`).

---

## Health Check

`GET /` also answers (a plain hello string, no auth) — use `/healthcheck` for monitoring.

### GET /healthcheck
Check if the server is running.

**Auth required**: No

**Response**:
```
200 OK
"I-one server is up and running!"
```

---

## Authentication

### POST /auth/user/login
Authenticate a user. Sets an HTTP-only JWT cookie on success. Login is allowed
before email verification so the client can show a signed-in verification state,
but protected app actions are blocked until `emailVerified` is `true`.

**Auth required**: No

**Request Body**:
```json
{
  "email": "john@example.com",
  "password": "securePassword123"
}
```

**Success Response** `200 OK`:
```json
{
  "message": "Login successful",
  "user": { ...userObject }
}
```
**Headers**: `Set-Cookie: Authentication=<jwt>; HttpOnly; Secure; SameSite=None`

**Error Responses**:
- `404` — user with email not found
- `401` — incorrect password

---

### GET /auth/user/logout
Clear the authentication cookie.

**Auth required**: No

**Success Response** `200 OK`: Clears the `Authentication` cookie.

---

## Users

### POST /user/register
Register a new user account.

**Auth required**: No

**Request Body**:
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "nickname": "johndoe",
  "password": "securePassword123",
  "address": "123 Main St, Lagos",
  "phoneNumber": "+2348012345678",
  "position": "ST",
  "location": { "type": "Point", "coordinates": [3.3792, 6.5244] },
  "isOwner": false,
  "height": 180,
  "dateOfBirth": "1990-01-01T00:00:00.000Z",
  "avatar": "https://s3.amazonaws.com/..."
}
```

**Field Notes**:
- `position`: `"DF"` | `"MF"` | `"ST"`
- `phoneNumber`: Nigerian format (`+234...`)
- `avatar`: optional — upload first with `POST /user/avatar`, then include URL here
- Registration automatically queues an email verification OTP. The OTP expires
  in 10 minutes and can be resent with `POST /user/verify-email/send`.

**Success Response** `201 Created`: Full user document.

**Error Responses**:
- `409` — email, phone number, or nickname already registered

---

### POST /user/register-owner
Register a pitch owner together with their pitch and payout details in one call.

**Auth required**: No

**Request Body** (top level): `user`, `location`, `payout`, `termsAccepted`, optional `newsletterOptIn`. The full shape is `RegisterOwnerRequest` in `src/users/dto/user.dto.ts`. Pricing fields on `location`:

```json
{
  "location": {
    "name": "Lagos Sports Complex",
    "address": "123 Sports Ave, Victoria Island, Lagos",
    "openingHour": "08:00",
    "closingHour": "22:00",
    "tier": "paid",
    "pricingOption": "hourly",
    "pricePerHour": 2000000
  }
}
```

- `pricePerHour`: **total** price of the pitch per hour, in kobo — required when `tier` is `"paid"` and `pricingOption` is `"hourly"`. Players in a session split it between themselves (pooled payment).
- `paymentPerPersonMonthly`: per-player monthly price, in kobo — required when `pricingOption` is `"monthly"`.
- `paymentPerPersonHourly` is no longer accepted — sending it returns `400` (`property paymentPerPersonHourly should not exist`).

---

### POST /user/avatar
Upload a user avatar before registration. Returns a URL to include in the register request.

**Auth required**: No

**Content-Type**: `multipart/form-data`

**Form Data**:
- `file` — image file (JPG, PNG, etc.)

**Success Response** `201 Created`:
```json
{ "avatar": "https://s3.amazonaws.com/avatars/123.jpg" }
```

---

### GET /user
Get the currently authenticated user's basic record.

**Auth required**: Yes (JWT cookie)

**Success Response** `200 OK`: Full user document.

---

### GET /user/profile
Get the authenticated user's profile (password field is cleared from response).

**Auth required**: Yes (JWT cookie)

**Success Response** `200 OK`:
```json
{
  "_id": "507f1f77bcf86cd799439011",
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "nickname": "johndoe",
  "phoneNumber": "+2348012345678",
  "position": "ST",
  "isOwner": false,
  "emailVerified": false,
  "height": 180,
  "location": { "type": "Point", "coordinates": [3.3792, 6.5244] },
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

---

### PATCH /user/profile
Update the authenticated user's profile.

**Auth required**: Yes (JWT cookie)

**Request Body** (all fields optional):
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "nickname": "johndoe2",
  "avatar": "https://s3.amazonaws.com/...",
  "address": "New Address",
  "phoneNumber": "+2348099999999",
  "position": "MF",
  "location": { "type": "Point", "coordinates": [3.4, 6.5] },
  "height": 182,
  "dateOfBirth": "1990-06-15T00:00:00.000Z"
}
```

**Success Response** `200 OK`: Updated user document (password cleared).

**Error Responses**:
- `409` — nickname already taken

---

### PATCH /user/device-token
Register or update the authenticated user's FCM device token, used to deliver push notifications (see [Notifications](#notifications)). One token per user — registering a new one overwrites the previous.

**Auth required**: Yes (JWT cookie)

**Request Body**:
```json
{
  "fcmToken": "e3f8a1b2c4d5..."
}
```

**Success Response** `200 OK`:
```json
{ "success": true }
```

---

### PATCH /user/change-password
Change the authenticated user's password. Requires the current password for verification.

**Auth required**: Yes (JWT cookie)

**Request Body**:
```json
{
  "oldPassword": "currentPassword123",
  "newPassword": "newSecurePassword123",
  "confirmNewPassword": "newSecurePassword123"
}
```

**Field Notes**:
- `newPassword`: minimum 6 characters

**Success Response** `200 OK`:
```json
{ "message": "Password changed successfully" }
```

**Error Responses**:
- `401` — old password is incorrect
- `409` — new passwords do not match

---

### DELETE /user/account
Permanently delete the authenticated user's account. Clears the auth cookie on success.

**Auth required**: Yes (JWT cookie)

**Blockers** — the request will be rejected if:
- User is currently in an active session → leave the session first (`DELETE /sessions/leave/:sessionId`)
- User is a player in a team registered in an active tournament (`registration` or `started`) → leave the tournament team first

**Success Response** `200 OK`:
```json
{ "message": "Account deleted successfully" }
```

**Error Responses**:
- `400` — user is in an active session or active tournament
- `404` — user not found

---

### POST /user/forget-password
Send a password reset OTP to the user's email. OTP is stored in the database and is valid for 15 minutes.

**Auth required**: No

**Request Body**:
```json
{ "email": "john@example.com" }
```

**Success Response** `200 OK`: OTP sent to email.

---

### POST /user/verify-otp
Verify the OTP received for password reset.

**Auth required**: No

**Request Body**:
```json
{
  "email": "john@example.com",
  "otp": 123456
}
```

> **Note**: `otp` is a **number**, not a string.

**Success Response** `200 OK`:
```json
{ "message": "OTP verified, proceed to reset password" }
```

**Error Responses**:
- `401` — invalid or expired OTP

---

### PUT /user/reset-password
Reset the user's password after OTP has been verified.

**Auth required**: No

**Request Body**:
```json
{
  "email": "john@example.com",
  "newPassword": "newSecurePassword123",
  "confirmPassword": "newSecurePassword123"
}
```

**Success Response** `200 OK`:
```json
{ "message": "Password reset successful" }
```

**Error Responses**:
- `401` — OTP not verified yet
- `409` — passwords do not match

---

### PATCH /user/promote/:userId
Give a user an admin role.

**Auth required**: Yes (JWT cookie, `SUPER_ADMIN` only)

**Request Body**:
```json
{ "role": "admin" }
```
- `role` — `admin` or `super_admin`.

**Success Response** `200 OK`:
```json
{ "message": "User role set to admin", "user": { "...": "updated user" } }
```

**Error Responses**:
- `400` — `role` isn't `admin` or `super_admin`
- `403` — caller isn't a super admin
- `404` — user not found

---

## Email Verification

Email verification applies to normal users and owner/admin accounts. A user can
log in before verifying their email, but protected app actions return
`EMAIL_VERIFICATION_REQUIRED` until the OTP is confirmed. Super admin accounts
are exempt from this guard.

**Allowed while unverified**:
- `GET /user`
- `GET /user/profile`
- `POST /user/verify-email/send`
- `POST /user/verify-email/confirm`
- `GET /auth/user/logout`

**Blocked protected action response** `403 Forbidden`:
```json
{
  "message": "Email verification is required before continuing",
  "code": "EMAIL_VERIFICATION_REQUIRED",
  "nextStep": "VERIFY_EMAIL"
}
```

### POST /user/verify-email/send
Send an email verification OTP to the user. OTP is stored in Redis and expires in 10 minutes.

**Auth required**: No

**Request Body**:
```json
{ "email": "john@example.com" }
```

**Success Response** `201 Created`:
```json
{ "message": "Verification OTP sent to your email" }
```

**Error Responses**:
- `404` — user not found
- `409` — email already verified

---

### POST /user/verify-email/confirm
Verify the email OTP and mark the user's email as verified.

**Auth required**: No

**Request Body**:
```json
{
  "email": "john@example.com",
  "otp": 123456
}
```

> **Note**: `otp` is a **number**, not a string.

**Success Response** `201 Created`:
```json
{ "message": "Email verified successfully" }
```

**Error Responses**:
- `401` — invalid or expired OTP

---

## Verification (KYC)

Owner accounts must submit identity verification documents before they can list pitches or receive payments. The admin reviews and approves or rejects submissions. **Players do not go through KYC** — email/phone verification is sufficient to join and start sessions.

**Flow**:
1. Owner submits documents → status: `PENDING`
2. Super admin approves → status: `APPROVED`, wallet created
3. Or super admin rejects → status: `REJECTED` with reason

Pending/rejected owners are blocked from normal protected app actions until
documents are approved, but they can still access:
- `GET /user`
- `GET /user/profile`
- `POST /verification/submit`
- `GET /verification/me`
- `GET /auth/user/logout`

### POST /verification/submit
Submit identity verification documents. Accepts multipart form data.

**Auth required**: Yes (JWT cookie)

**Role required**: `ADMIN` (owner accounts) — any other role receives `403`.

**Content-Type**: `multipart/form-data`

**Form Fields**:
| Field | Type | Description |
|---|---|---|
| `idType` | string | `"BVN"` \| `"NIN"` \| `"DRIVERS_LICENSE"` \| `"PASSPORT"` |
| `idNumber` | string | Number printed on the ID |
| `address` | string | Current residential address |
| `frontPage` | file | Front image of the ID (max 5MB) |
| `backPage` | file | Back image of the ID (max 5MB) |
| `locationPictures` | file[] | 1–5 location pictures (house frontage, street view, user holding ID) |

**Success Response** `201 Created`:
```json
{
  "message": "Verification documents submitted successfully",
  "verification": {
    "_id": "507f...",
    "userId": "507f...",
    "idType": "NIN",
    "idNumber": "12345678901",
    "address": "123 Main St, Lagos",
    "frontUrl": "https://s3.amazonaws.com/docs/front.jpg",
    "backUrl": "https://s3.amazonaws.com/docs/back.jpg",
    "locationPictures": ["https://s3.amazonaws.com/loc/1.jpg"],
    "status": "PENDING"
  }
}
```

**Notes**:
- If a previous submission exists (any status), this **updates** it and resets status to `PENDING`
- A re-submission after rejection is allowed

---

### GET /verification/me
Get the authenticated user's own verification document.

**Auth required**: Yes (JWT cookie)

**Role required**: `ADMIN` (owner accounts) — any other role receives `403`.

**Success Response** `200 OK`: Verification document or `null` if none submitted.

---

### GET /verification/all
Get all verification documents. Paginated. **Admin use.**

**Auth required**: Yes (JWT cookie)

**Query Parameters**:
- `page` (number, default: 1)
- `limit` (number, default: 20)

**Success Response** `200 OK`:
```json
{
  "verifications": [ ...verificationDocuments ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "totalPages": 3
  }
}
```

---

### PATCH /verification/:id/approve
Approve a verification submission. Creates a wallet for the user (no Paystack calls — owners fund their wallet separately via `POST /wallet/fund`).

**Auth required**: Yes (JWT cookie + `SUPER_ADMIN` role)

**Path Parameters**:
- `id` — verification document ID

**Success Response** `200 OK`:
```json
{
  "message": "Verification approved and wallet created successfully",
  "verification": { ...verificationDocument, "status": "APPROVED" },
  "wallet": { "_id": "...", "balance": 0, "currency": "NGN", "status": "ACTIVE" }
}
```

**Error Responses**:
- `404` — verification not found
- `400` — already approved

---

### PATCH /verification/:id/reject
Reject a verification submission with a reason.

**Auth required**: Yes (JWT cookie + `SUPER_ADMIN` role)

**Path Parameters**:
- `id` — verification document ID

**Request Body**:
```json
{ "rejectionReason": "ID image is blurry, please resubmit" }
```

**Success Response** `200 OK`:
```json
{
  "message": "Verification rejected successfully",
  "verification": { ...verificationDocument, "status": "REJECTED", "rejectionReason": "..." }
}
```

**Error Responses**:
- `404` — verification not found
- `400` — already rejected

---

## Locations

### POST /location/register
Register a new sports location. Owner only.

**Auth required**: Yes (JWT cookie + `IsOwnerGuard`)

**Request Body**:
```json
{
  "name": "Lagos Sports Complex",
  "address": "123 Sports Ave, Victoria Island, Lagos",
  "location": { "type": "Point", "coordinates": [3.42158, 6.45306] },
  "pitchPhoto": "https://s3.amazonaws.com/pitches/photo.jpg",
  "friendly": true,
  "tournament": true,
  "tournamentFee": 500000,
  "tier": "paid",
  "pricingOption": "hourly",
  "pricePerHour": 2000000,
  "paymentPerPersonMonthly": 2000000,
  "openingHour": "08:00",
  "closingHour": "22:00"
}
```

**Field Notes**:
- `tier`: `"free"` | `"paid"` (required)
- `pricingOption`: `"hourly"` | `"monthly"` — required when `tier` is `"paid"`
- `pricePerHour`: **total** price of the pitch per hour, in **kobo** — required when `pricingOption` is `"hourly"` (e.g. `2000000` = ₦20,000/hr). The players in a session split it between themselves however they like (pooled payment — see [Wallet & Payments](#wallet--payments)). Replaces the old per-player `paymentPerPersonHourly`, which is no longer accepted.
- `paymentPerPersonMonthly`: amount per player per month, in **kobo** — required when `pricingOption` is `"monthly"`
- `openingHour` / `closingHour`: operating hours in `HH:mm` 24-hour format (e.g. `"08:00"`, `"22:00"`). Sessions cannot be booked outside these hours. All times are **Lagos time** (WAT, UTC+1), whatever timezone the server runs in. `closingHour` earlier than `openingHour` means open overnight (e.g. `23:00`–`05:00`, and a game from 23:30 to 01:00 is fine). The same time for both (e.g. `00:00`–`00:00`) means open 24 hours.

**Success Response** `201 Created`: Full location document.

**Error Responses**:
- `409` — a location already exists at those coordinates

---

### POST /location/pitch/:locationId
Upload or replace a pitch photo for a location.

**Auth required**: Yes (JWT cookie + `IsOwnerGuard`)

**Important**: this route is for approved owners only. Pending owners who have
not completed KYC/document approval should not call this during signup; they
will receive `OWNER_VERIFICATION_REQUIRED` from `JwtAuthGuard`.

**Content-Type**: `multipart/form-data`

**Path Parameters**:
- `locationId` — location ID

**Form Data**:
- `file` — image file

**Success Response** `200 OK`:
```json
{ "pitchPhoto": "https://s3.amazonaws.com/pitches/123.jpg" }
```

**Error Responses**:
- `400` — missing `file` form field
- `403` — owner verification required, not an owner, or not the location owner
- `404` — location not found
- `502` — S3 upload failed

---

### GET /location/all
Get all registered locations.

**Auth required**: Yes (JWT cookie)

**Success Response** `200 OK`: Array of location documents.

---

### GET /location/nearby
Get locations near a coordinate, sorted by proximity.

**Auth required**: Yes (JWT cookie)

**Query Parameters**:
- `lng` (number, required) — longitude
- `lat` (number, required) — latitude

**Example**: `GET /location/nearby?lng=3.42158&lat=6.45306`

**Notes**:
- Results are capped to locations within **5 km** of the supplied coordinate (`$maxDistance: 5000`). Locations beyond 5 km are excluded regardless of query params.

**Success Response** `200 OK`: Array of location documents sorted nearest-first.

---

### GET /location/search
Search registered locations by name.

**Auth required**: Yes (JWT cookie)

**Query Parameters**:
- `name` (string, required) — full or partial location name, case-insensitive

**Example**: `GET /location/search?name=lekki`

**Notes**:
- Exact name matches (case/whitespace-insensitive) are served from a Redis cache — O(1), and consistent across all horizontally-scaled server instances since the cache is Redis, not per-process memory. Cache entries are written on location create and invalidated on any update to that location (pitch condition, opening hours, pricing); a 1-hour TTL is a safety net on top of that.
- If there's no exact cache/DB hit, falls back to a prefix search against an indexed, lowercased copy of `name` (`nameLower`) — index-backed, not a full collection scan, but not O(1). Capped to 10 results.
- Only `ACTIVE` locations (or locations with no `status` set) are returned.

**Success Response** `200 OK`:
```json
{
  "exact": true,
  "cached": true,
  "results": [ { ...locationDocument } ]
}
```
- `exact: false` means the results (if any) came from the partial/prefix fallback rather than an exact match.

**Error Responses**:
- `400` — `name` query parameter missing or blank

---

### GET /location
Get the current user's own location record.

**Auth required**: Yes (JWT cookie)

**Success Response** `200 OK`:
```json
{
  "locationInfo": { ...locationDocument },
  "address": "123 Sports Ave",
  "coordinates": [3.42158, 6.45306]
}
```

---

### GET /location/matches/:locationId
Get all matches played at a specific location. Owner only.

**Auth required**: Yes (JWT cookie + `IsOwnerGuard`)

**Path Parameters**:
- `locationId` — location ID

**Success Response** `200 OK`: Array of match documents for that location, each with `teamOne`, `teamTwo`, scores, `status`, `sequence`, `winner`, `isStarted` (deprecated) and `session`.

---

## Owner Dashboard

All dashboard endpoints require `IsOwnerGuard`.

### GET /location/:locationId/dashboard
Get the full owner dashboard for a location (summary + recent data).

**Auth required**: Yes (JWT cookie + `IsOwnerGuard`)

**Path Parameters**:
- `locationId` — location ID

**Success Response** `200 OK`: Combined dashboard data.

---

### GET /location/:locationId/dashboard/summary
Get a brief summary of the location (photo, address, condition, hours).

**Auth required**: Yes (JWT cookie + `IsOwnerGuard`)

**Success Response** `200 OK`:
```json
{
  "pitchCondition": "Good",
  "pitchPhoto": "https://s3.amazonaws.com/...",
  "address": "123 Sports Ave",
  "openingHour": "08:00",
  "closingHour": "22:00"
}
```

---

### GET /location/:locationId/dashboard/last-matches
Get the most recent matches at this location.

**Auth required**: Yes (JWT cookie + `IsOwnerGuard`)

**Query Parameters**:
- `limit` (number, default: 5)
- `skip` (number, default: 0)

**Success Response** `200 OK`: Array of match documents.

---

### GET /location/:locationId/dashboard/visitors
Get the count of unique players who have visited this location.

**Auth required**: Yes (JWT cookie + `IsOwnerGuard`)

**Success Response** `200 OK`:
```json
{ "visitorCount": 152 }
```

---

### GET /location/:locationId/dashboard/upcoming-sessions
Get upcoming sessions scheduled at this location.

**Auth required**: Yes (JWT cookie + `IsOwnerGuard`)

**Query Parameters**:
- `limit` (number, default: 20)
- `skip` (number, default: 0)

**Success Response** `200 OK`: Array of session documents.

---

### GET /location/:locationId/dashboard/revenue
Get revenue earned at this location for all time periods in a single call. Only counts session payments with status `PAID`. Returns totals for this week, this month, and this year so the frontend can switch between them without refetching.

**Auth required**: Yes (JWT cookie + `IsOwnerGuard`)

**Path Parameters**:
- `locationId` — location ID

**Example**: `GET /location/507f.../dashboard/revenue`

**Success Response** `200 OK`:
```json
{
  "this_week":  { "total": 5000000,  "count": 3  },
  "this_month": { "total": 20000000, "count": 12 },
  "this_year":  { "total": 95000000, "count": 58 }
}
```

**Field Notes**:
- `total` — sum of paid session payments for the period, in **kobo** (the owner's `baseAmount`, i.e. what they actually received — commission, if any, is excluded)
- `count` — number of individual payments in that period
- Periods (Lagos time): `this_week` starts Sunday 00:00, `this_month` starts the 1st, `this_year` starts Jan 1st

---

### GET /location/:locationId/dashboard/users-chart
Get the number of unique users (members + captains) who played at this location, grouped by month and year. Used to render the bar chart on the owner dashboard.

**Auth required**: Yes (JWT cookie + `IsOwnerGuard`)

**Path Parameters**:
- `locationId` — location ID

**Success Response** `200 OK`:
```json
{
  "total": 25000,
  "data": [
    { "month": 1, "year": 2025, "count": 18 },
    { "month": 2, "year": 2025, "count": 65 },
    { "month": 3, "year": 2025, "count": 20 },
    { "month": 4, "year": 2025, "count": 20 },
    { "month": 5, "year": 2025, "count": 10 },
    { "month": 6, "year": 2025, "count": 22 }
  ]
}
```

**Field Notes**:
- `total` — sum of all `count` values across all months
- `month` — integer 1–12 (January = 1)
- `count` — unique users who participated in sessions at this location that month

---

### PATCH /location/:locationId/pitch-condition
Update the pitch condition for a location. Owner only.

**Auth required**: Yes (JWT cookie + `IsOwnerGuard`)

**Path Parameters**:
- `locationId` — location ID

**Request Body**:
```json
{ "pitchCondition": "good" }
```

**Field Notes**:
- `pitchCondition`: `"excellent"` | `"good"` | `"fair"` | `"poor"` | `"wet"` | `"under_maintenance"`

**Success Response** `200 OK`:
```json
{
  "message": "Pitch condition updated",
  "location": { "_id": "507f...", "name": "Arena Lagos", "pitchCondition": "good", ... }
}
```

**Error Responses**:
- `403` — not the owner of this location
- `404` — location not found

---

## Sessions

All session endpoints require authentication.

### GET /sessions/nearby-sessions
Find active sessions near a coordinate.

**Auth required**: Yes (JWT cookie)

**Query Parameters**:
- `lng` (number) — longitude
- `lat` (number) — latitude

**Success Response** `200 OK`: Array of match objects with populated session and location data.

---

### GET /sessions/by-location/:locationId?date=YYYY-MM-DD
Get all sessions at a specific location on a given date, sorted by start time ascending. Used to power the match schedule calendar (frontend sends the selected date, gets back that day's sessions).

**Auth required**: Yes (JWT cookie)

**Path Parameters**:
- `locationId` — the location ID

**Query Parameters**:
- `date` *(required)* — date in `YYYY-MM-DD` format (e.g. `2026-04-08`). This is a **Lagos calendar day**: sessions starting 00:00–23:59 Lagos time. A session is listed under the day it starts, so a 01:00 game in an overnight window shows under the next day.

**Success Response** `200 OK`:
```json
[
  {
    "_id": "507f...",
    "location": { "_id": "507f...", "name": "Arena Lagos", "address": "..." },
    "captain": { "_id": "507f...", "firstName": "Emeka", "nickname": "Striker9" },
    "members": [ ... ],
    "startTime": "2026-04-08T10:00:00.000Z",
    "stopTime": "2026-04-08T12:00:00.000Z",
    "matchType": "friendly",
    "isFull": false,
    "finished": false
  }
]
```

**Notes**:
- Returns an empty array `[]` if no sessions exist for that location on that date
- Date range is evaluated in UTC (`00:00:00.000` → `23:59:59.999`)

---

### GET /sessions/all
Get all non-finished sessions, paginated.

**Auth required**: Yes (JWT cookie)

**Query Parameters**:
- `page` (number, default: 1)
- `limit` (number, default: 6)

**Success Response** `200 OK`:
```json
{
  "sessions": [ ...sessionDocuments ],
  "pagination": { "page": 1, "limit": 6, "total": 30, "totalPages": 5 }
}
```

---

### POST /sessions/start
Start a new session at a location. The calling user becomes the captain. Requires the user's email to be verified — **KYC/document verification is not required for players**.

**Auth required**: Yes (JWT cookie)

**Request Body**:
```json
{ "locationId": "507f1f77bcf86cd799439013" }
```

**Success Response** `201 Created`: The created session document.

**Error Responses**:
- `403` — email not verified
- `404` — user or location not found

---

### POST /sessions/create/:sessionId
Configure a session that was started. Only the session captain can call this.

**Auth required**: Yes (JWT cookie)

**Path Parameters**:
- `sessionId` — session ID returned from `POST /sessions/start`

**Request Body**:
```json
{
  "setNumber": 3,
  "playersPerTeam": 5,
  "timeDuration": 120,
  "minsPerSet": 30,
  "startTime": "2025-11-10T14:00:00.000Z",
  "winningDecider": "penalties",
  "rotationFormat": "winner_stays"
}
```

**Notes**:
- `setNumber` is the number of **teams**. `minsPerSet` is the length of **one game**.
- `rotationFormat` (optional, default `winner_stays`) — who plays next once a game ends:
  - `winner_stays` — the winner stays on, the loser goes to the back of the queue.
  - `round_robin` — every team plays every other team in a fixed order, repeating until `stopTime`.
- `winningDecider` (required) — how a **drawn** game is settled under `winner_stays`. Ignored for `round_robin`, where draws stay draws:
  - `penalties` — the end-match request must say who won the shootout.
  - `both_off` — both teams leave and the next two in the queue come on. With 3 teams, the team that stayed on leaves and the team that just came on plays the waiting team. With 2 teams they play again.
- Any other value for either field returns `400`.
- `maxNumber` is computed as `setNumber × playersPerTeam`
- Returns `409` if the time slot overlaps another session at the same pitch. Sessions at other pitches, and cancelled or refunded sessions, don't block the slot. Back-to-back sessions (one ends at 11:00, the next starts at 11:00) are fine. The check and the save happen as one atomic step per pitch, so if two captains book the same slot at the same moment, exactly one succeeds and the other gets this `409`.
- Returns `400` if the session doesn't fit inside the location's `openingHour`–`closingHour` window (Lagos time). Sessions can cross midnight when the pitch is open overnight or 24 hours.
- `paymentRequired`, `paymentMode`, `paymentTarget` and `paymentAmount` are automatically derived from the location's `tier` and `pricingOption` — no need to pass them manually
- For `hourly` pricing, `timeDuration` must be in full-hour blocks only (`60`, `120`, `180`, ...)
- Hourly sessions are **pooled** (`paymentMode: "POOL"`): `paymentTarget = pricePerHour × (timeDuration / 60)` is the total the whole session pays; `paymentAmount` is `0`
- Monthly sessions stay per-player (`paymentMode: "PER_PERSON"`, `paymentAmount = paymentPerPersonMonthly`)
- Returns `400` for a paid hourly location whose owner hasn't set `pricePerHour` yet

**Success Response** `200 OK`: Updated session document.

---

### POST /sessions/join/:sessionId
Join an existing session as a member.

**Auth required**: Yes (JWT cookie)

**Path Parameters**:
- `sessionId` — session ID

**Success Response** `200 OK`:
```json
{
  "message": "User successfully joined session",
  "session": { ...sessionDocument }
}
```

**Notes**:
- If this join fills the session (`members.length === maxNumber`) **and** `paymentRequired` is true, payment opens:
  - **POOL** (hourly): the pot opens (`paymentStatus: "PENDING"`). No per-player payment records are created — members contribute through `POST /wallet/session/:sessionId/pay` with an `amount`. A pot that's already open or full is not reopened if the session fills again after someone leaves.
  - **PER_PERSON** (monthly / older sessions): payment records are automatically initialized for all members who still owe payment
- For **monthly** pricing: a member who already paid within the last 30 days at this location is **skipped** — no new payment record is created for them
- For **hourly** pricing: every member always gets a fresh payment record for each session

**Error Responses**:
- `400` — session is already full
- `409` — user is already in this session

---

### GET /sessions/my-current
Get the calling user's active session. Returns the full session document (same shape as `GET /sessions/:sessionId`) or `null` if the user is not currently in a session.

**Auth required**: Yes (JWT cookie)

**Success Response** `200 OK`: Full session document (see `GET /sessions/:sessionId`) or `null`.

---

### GET /sessions/:sessionId
Get a session with its members populated. If the session requires payment, each member includes a `paymentStatus` field for the paid/unpaid badge.

**Auth required**: Yes (JWT cookie)

**Success Response** `200 OK`:
```json
{
  "_id": "507f...",
  "paymentRequired": true,
  "members": [
    {
      "_id": "507f...",
      "firstName": "Emeka",
      "lastName": "Obi",
      "nickname": "Striker9",
      "avatar": "https://...",
      "paymentStatus": "PAID"
    },
    {
      "_id": "507f...",
      "firstName": "Tunde",
      "lastName": "Adewale",
      "nickname": "TundeDF",
      "avatar": null,
      "paymentStatus": "PENDING"
    }
  ]
}
```

**`paymentStatus` values per member**:
| Value | Meaning |
|---|---|
| `PAID` | Member has paid |
| `PENDING` | Payment initialized but not yet completed |
| `FAILED` | Payment attempt failed |
| `REFUNDED` | Payment was refunded |
| `EXPIRED` | POOL only: the member started a checkout but didn't finish it in time; nothing was charged |
| `NOT_REQUIRED` | Session is free — no payment needed |

**POOL sessions**: members don't each owe a fixed amount, so this badge means "has this member contributed". `PAID` = they have at least one confirmed contribution (top-ups don't change it). A member who hasn't contributed shows `PENDING`, which in a pool does **not** mean they owe anything — the pot can be covered by others. For amounts and progress, use the `pool` block from `GET /wallet/session/:sessionId/payment-status` or the payment stream.

---

### GET /sessions/members/:sessionId
Get the member list for a session (nickname only).

**Auth required**: Yes (JWT cookie)

**Success Response** `200 OK`: Session with members array.

---

### DELETE /sessions/leave/:sessionId
Leave a session. If you've already paid for this session (and it hasn't started yet), a Paystack refund is requested automatically before you're removed — you can't leave with an outstanding paid-and-not-refunded session. If the refund can't even be requested (Paystack call fails), the leave is blocked entirely so you don't lose your spot and your money at the same time.

**POOL sessions** (hourly):
- **Pot not yet full**: all of the leaving player's contributions are refunded (same blocking rule — if a refund can't be requested, the leave fails with `500`), and `remaining` goes back up for everyone. Any checkout they had in progress is settled first.
- **Pot already full**: the player can leave, but gets **no refund** — their contribution stays in the pot. Show this clearly in the leave confirmation.

Note: a successful leave only means the refund was *requested* — Paystack refunds are asynchronous and can take up to 10 business days to settle (see `POST /sessions/cancel/:sessionId` and the Webhooks section for how refund completion is tracked).

**Auth required**: Yes (JWT cookie)

**Success Response** `200 OK`:
```json
{
  "message": "User successfully left session",
  "session": { ...updatedSessionDocument }
}
```

**Error Responses**:
- `500` — refund could not be requested; you remain in the session

---

### POST /sessions/end/:sessionId
End a session. Clears all member `currentSession` references and marks location as available.

**Auth required**: Yes (JWT cookie)

**Authorization**: Only the session captain or the location owner can end a session.

**Success Response** `200 OK`:
```json
{ "message": "Session ended successfully", "session": { ...sessionDocument } }
```

**Error Responses**:
- `403` — caller is neither the captain nor the location owner

---

### DELETE /sessions/delete/:sessionId
Delete a session entirely.

**Auth required**: Yes (JWT cookie)

**Authorization**: Only the session captain or the location owner can delete a session.

**Success Response** `200 OK`:
```json
{ "message": "Session deleted successfully" }
```

**Error Responses**:
- `403` — caller is neither the captain nor the location owner
- `400` — session has paid members whose refunds have not cleared; cancel first and wait for refunds to settle

---

### POST /sessions/cancel/:sessionId
Cancel a session and automatically request Paystack refunds for every member who has paid. The session moves to `CANCELLED` immediately; it only moves to `REFUNDED` once every refund's `refund.processed` webhook arrives from Paystack (this can take up to 10 business days).

**Auth required**: Yes (JWT cookie)

**Authorization**: Only the session captain or the location owner can cancel a session.

**Success Response** `200 OK`:
```json
{
  "message": "Session cancelled — refunds have been requested and will settle over the next few days",
  "session": { ...sessionDocument },
  "refunds": {
    "allInitiated": true,
    "totalPaid": 3,
    "results": [
      { "paymentId": "...", "userId": "...", "success": true }
    ]
  }
}
```

**Notes**:
- If no members have paid (`totalPaid: 0`), message is `"Session cancelled"` with no refund info.
- If some refund requests fail (`allInitiated: false`), those members need manual follow-up — the session is still marked `CANCELLED`.
- A session already in `CANCELLED` or `REFUNDED` status returns `400`.
- Completed sessions (`finished: true`) cannot be cancelled.

**Error Responses**:
- `403` — caller is neither the captain nor the location owner
- `400` — session is already cancelled, refunded, or completed

---

### PATCH /sessions/reschedule/:sessionId
Reschedule a session to a new time.

**Auth required**: Yes (JWT cookie)

**Authorization**: Only the session captain or the location owner can reschedule a session.

**Path Parameters**:
- `sessionId` — session ID

**Request Body**:
```json
{
  "startTime": "2025-11-12T16:00:00.000Z",
  "timeDuration": 120
}
```

**Success Response** `200 OK`:
```json
{ "message": "Session rescheduled successfully", "session": { ...sessionDocument } }
```

**Error Responses**:
- `403` — caller is neither the captain nor the location owner
- `409` — overlaps with another session at the same pitch (same rules as configuring a session: other pitches and cancelled/refunded sessions don't count, and the session's own current slot doesn't block it). Concurrent reschedules into the same slot are atomic: one wins, the rest get `409`.
- `409` — payment has already started for this session and the new duration would change the price (or would switch an older per-player session to pooled). Payment terms are frozen once payment opens: reschedule to the same duration, or cancel and create a new session. Rescheduling to the same duration keeps all payment state untouched.
- `400` — new time doesn't fit inside the location's operating hours (Lagos time; crossing midnight is fine for overnight or 24-hour pitches)

---

### POST /sessions/notify/:sessionId
Send a free-text push notification to every member of a session (e.g. "pitch closed today due to rain").

**Auth required**: Yes (JWT cookie)

**Authorization**: Only the session captain or the location owner can send a broadcast.

**Path Parameters**:
- `sessionId` — session ID

**Request Body**:
```json
{
  "title": "Pitch closed today",
  "body": "Due to heavy rain, today's session is cancelled. Sorry for the inconvenience!"
}
```

**Success Response** `200 OK`:
```json
{ "message": "Broadcast sent to all session members" }
```

**Notes**:
- Push only — not sent by email (same-day logistics messages are time-sensitive; email is too slow).
- Rate-limited to one broadcast per session every 5 minutes.

**Error Responses**:
- `403` — caller is neither the captain nor the location owner
- `404` — session not found
- `429` — a broadcast was already sent for this session recently

---

## Sets

Sets (teams) for a paid session are normally created **automatically** — the moment every member's payment is confirmed, the server allocates players into balanced teams on its own (fire-and-forget, so it never blocks or delays anyone's payment confirmation). In practice this lands well under a second after the last payment, but it's not instant, and — much more rarely — it can fail outright (e.g. an unexpected error) with nothing server-side to retry it automatically. `POST /sets/create/:sessionId` below is both the internal mechanism for that and the **manual fallback** the client should call if auto-allocation doesn't show up in time.

**Recommended polling pattern** for the moment every member has paid:
1. Once the session shows `allPaymentsCompleted: true` (or `paymentStatus: "COMPLETED"`) but `GET /sets/:sessionId` still returns `[]`, show a brief "Finalizing teams..." state.
2. Poll `GET /sets/:sessionId` every **500ms**.
3. Stop as soon as the response array is non-empty and show the teams.
4. If still empty after **~10 attempts (5 seconds)**, stop polling and show a "Taking longer than expected" state with a **manual retry** button that calls `POST /sets/create/:sessionId` — this is the same endpoint auto-allocation uses internally, so retrying is safe and won't create duplicates (see error responses below).

### POST /sets/create/:sessionId
Create team sets for a session. The number of sets equals the session's `setNumber`, teams are auto-balanced from the session's members, team names are auto-assigned. Normally triggered automatically (see above) — call this directly only as the manual retry fallback.

**Auth required**: Yes (JWT cookie, caller must be a member of the session)

**Path Parameters**:
- `sessionId` — session ID

**Success Response** `201 Created`:
```json
{
  "message": "Sets created successfully",
  "sets": [ { "_id": "507f...", "session": "507f...", "name": "Team 1", "players": [...] }, ... ]
}
```

**Error Responses**:
- `403` — caller is not a member of this session
- `400` — sets already exist for this session (safe to ignore if retrying after a slow auto-allocation — just call `GET /sets/:sessionId` instead), session has no `setNumber` configured, or session is not yet full
- `404` — session not found

---

### GET /sets/:sessionId
Get all sets for a session. Returns `[]` if sets haven't been allocated yet — this is the response to poll on (see the pattern above), not an error.

**Auth required**: Yes (JWT cookie)

**Success Response** `200 OK`: Array of set documents for that session.

---

### GET /sets/team/:setId
Get a single team (set) by ID with its `players` fully populated. Use this when the user clicks on a team to see its members.

**Auth required**: Yes (JWT cookie)

**Path Parameters**:
- `setId` — the set/team ID

**Success Response** `200 OK`:
```json
{
  "_id": "507f...",
  "session": "507f...",
  "name": "Team 1",
  "players": [
    { "_id": "507f...", "firstName": "John", "lastName": "Doe", "nickname": "johndoe", "avatar": "https://..." },
    { "_id": "507f...", "firstName": "Jane", "lastName": "Smith", "nickname": "janesmith", "avatar": "https://..." }
  ]
}
```

**Error Responses**:
- `404` — set not found

---

### GET /sets
Get all sets in the system.

**Auth required**: Yes (JWT cookie)

**Success Response** `200 OK`: Array of all set documents.

---

## Matches

### Who can record a match
Start, end, score changes and goal scorers are recorded by:
- **The match's referee**, when it has one (`referee` on the match). On their own phone, that's the referee's own login. In Referee mode on a captain's phone, it's that captain's login (`deviceOwner`).
- **Either playing team**, when it has no referee. The score is kept so rotation knows the winner, but goal scorers are rejected and the result is `UNOFFICIAL` — it never counts toward stats.

The pitch owner has no recording power of their own. They can assign referees, and can be put on the referee list like anyone else. See the **Referees** section for the roster and assignment endpoints.

### Recording safely on a bad network
Pitch-side network is unreliable, so every score change is built to be retried without counting twice.

**`scoreVersion`** — a number on the match that goes up by 1 on every goal and every undo, and on nothing else. Every goal, undo and end request sends `expectedScoreVersion`: the version the recorder's screen showed when they tapped. If the match has moved on since then, the server refuses with **`409`** and puts the current score in `details`:
```json
{
  "statusCode": 409,
  "message": "The score changed since your screen loaded — showing the latest score",
  "details": { "scoreVersion": 3, "teamOneScore": 2, "teamTwoScore": 1 }
}
```
This catches a duplicate whatever caused it: a retry after a lost response, a new tap after the app was refreshed on an old screen, or two phones recording the same goal (possible when a match has no referee and both teams run the scoreboard).

**`eventId`** — a random id (8–64 characters, a UUID is ideal) the app creates **once per tap**. If a request arrives with an `eventId` the match has already applied, the server answers **`200`** with the current match and changes nothing — so a plain retry gets a clean success instead of a `409`.

**What the app must do:**
1. When the recorder taps, create the `eventId` and save the tap (with its `eventId` and `expectedScoreVersion`) to the phone's storage **before** sending. Keep it until the server answers `200`, `400` or `409`, and resend it on app restart.
2. Send queued taps **one at a time, in order**. Each `200` returns the match with its new `scoreVersion`; the next tap uses that.
3. Show queued taps on screen straight away ("Goal — Ada · sending…") so nobody taps again thinking it didn't register.
4. Send `end` only once the queue is empty.
5. On `409`, or after reconnecting, reload `GET /matches/details/:matchId` and show the current score and `events`. The SSE stream may have missed updates while offline.

`start` and `end` are safe to repeat too: starting a live match returns it unchanged, and ending a match that already ended at the same `scoreVersion` returns the same result and the same next game.

The one thing this can't catch is a recorder who sees a goal already on screen and taps again on purpose — that is a real second goal as far as the server can tell. `events` (who recorded what, when), undo, and the review step for Referee-mode results cover it.

### POST /matches/matchup/:sessionId
Create **game 1** of a session. Every later game is created automatically by `POST /matches/end/:matchId`, because who plays next depends on the result (see `rotationFormat` on session create). If the session requires payment, it must be fully paid first: every member has paid (PER_PERSON), or the pot is full (POOL — regardless of how many members contributed).

Any number of teams from 2 up works, including odd counts.

**Auth required**: Yes (JWT cookie)

**Success Response** `201 Created`: An array containing the one created match (an array so older app builds keep working). The match has `sequence: 1`, `status: "SCHEDULED"` and `waiting` (the queue of team ids not playing this game, front first).

**Error Responses**:
- `402 Payment Required` — session requires payment and isn't fully paid yet (some members unpaid, or pot not full)
- `400 Bad Request` — teams already matched, or fewer than 2 teams

---

### GET /matches/matchups/:sessionId
View every game of a session so far, ordered by `sequence`.

**Auth required**: Yes (JWT cookie)

**Success Response** `200 OK`: Array of match documents.

---

### POST /matches/start/:matchId
Start a match: `status` goes from `SCHEDULED` to `LIVE` and `startedAt` is set. If the match has a referee, they are re-checked for eligibility at kick-off. Only the person **recording this match** may call this — see *Who can record a match* above.

**Auth required**: Yes (JWT cookie, see *Who can record a match*)

**Success Response** `200 OK`: `{ "message": "Team 1 vs Team 2 is underway", "match": { ...updated match } }`. Starting a match that is already live returns it unchanged, so a retry is safe.

**Error Responses**:
- `400` — match has already finished, or the assigned referee is no longer eligible
- `403` — caller isn't allowed to record this match (see *Who can record a match*)
- `404` — match or session not found

---

### GET /matches/details/:matchId
Get full details of a match, including both teams with their players populated and all goal scorers.

**Auth required**: Yes (JWT cookie)

**Success Response** `200 OK`:
```json
{
  "_id": "507f1f77bcf86cd799439011",
  "teamOne": {
    "_id": "507f...",
    "name": "Team 1",
    "players": [
      { "_id": "507f...", "firstName": "John", "lastName": "Doe", "nickname": "johndoe", "position": "ST" }
    ]
  },
  "teamTwo": {
    "_id": "507f...",
    "name": "Team 2",
    "players": [
      { "_id": "507f...", "firstName": "Jane", "lastName": "Smith", "nickname": "janesmith", "position": "MF" }
    ]
  },
  "teamOneScore": 1,
  "teamTwoScore": 4,
  "isStarted": false,
  "status": "FINISHED",
  "sequence": 3,
  "waiting": ["507f..."],
  "startedAt": "2026-10-23T18:00:00.000Z",
  "endedAt": "2026-10-23T18:10:00.000Z",
  "winner": "507f...",
  "decidedBy": "NORMAL_TIME",
  "matchType": "friendly",
  "goalScorers": [
    { "player": { "_id": "507f...", "firstName": "John", "nickname": "johndoe" }, "team": "teamOne" },
    { "player": { "_id": "507f...", "firstName": "Jane", "nickname": "janesmith" }, "team": "teamTwo" }
  ]
}
```

**Match fields**:
- `status` — `SCHEDULED` → `LIVE` → `FINISHED`. Use this, not `isStarted`.
- `isStarted` — **deprecated**, kept equal to `status === "LIVE"` for older app builds. Note it can't tell a finished match from one that hasn't started.
- `sequence` — game number within the session (1, 2, 3…).
- `waiting` — team ids not playing this game, front of the queue first. Under `winner_stays`, `teamOne` is the team that stayed on and `teamTwo` the team that came on. Missing on matches created before rotation existed.
- `winner` — team id, or `null` for a draw that stayed a draw.
- `decidedBy` — `NORMAL_TIME`, `PENALTIES` or `DRAW`.
- `penaltyWinner` — `teamOne` / `teamTwo`, only when a draw was settled on penalties. Shootout goals never change the score or `goalScorers`.
- `referee` — the current referee's roster entry id (see **Referees**), or `null`.
- `refereeHistory` — every referee change: `{ referee, at, by }`. `referee: null` means it was removed.
- `resultStatus` — set at full time: `UNOFFICIAL`, `PENDING_CONFIRMATION`, `CONFIRMED` or `DISPUTED`. `CONFIRMED` and `PENDING_CONFIRMATION` count toward stats; a dispute takes a result back out.
- `reviewUntil` — `PENDING_CONFIRMATION` only: the end of the dispute window.
- `statsPostedAt` — when players' stats were written for this match.
- `scoreVersion` — see *Recording safely on a bad network*.
- `events` — every score change in order: `{ eventId, type: "GOAL" | "UNDO", team, scorer?, assistedBy?, undoes?, recordedByUser, referee, at }`. `undoes` is the `eventId` of the goal an undo cancelled.
- `confirmedBy` / `confirmedAt` — who confirmed or disputed a `PENDING_CONFIRMATION` result.
- `goalScorers[].assistedBy` — the assisting player, if any.
- `goalScorers[].eventId` — the `GOAL` event this came from.
- `goalScorers[].recordedBy` / `recordedAt` — the referee roster entry that recorded the goal.

**Error Responses**:
- `404` — match not found

---

### POST /matches/goal-scorer/:matchId
Record a goal **with its scorer** (one call per goal — it also adds 1 to the score, so don't call `increment-score` for the same goal). Only the match's **referee** may call this — a match with no referee never records goal scorers. See *Recording safely on a bad network* for `eventId` and `expectedScoreVersion`.

**Auth required**: Yes (JWT cookie, see *Who can record a match*)

**Request Body**:
```json
{
  "playerId": "507f1f77bcf86cd799439011",
  "team": "teamOne",
  "assistedBy": "507f1f77bcf86cd799439012",
  "eventId": "6f1c2a9e-1b7d-4c55-9a4e-2f0b8a3c7d11",
  "expectedScoreVersion": 2
}
```

**Field Notes**:
- `playerId` — the player who scored. Must be on `team`.
- `team` — `"teamOne"` or `"teamTwo"`.
- `assistedBy` (optional) — the player who assisted. Must be a teammate of the scorer, and not the scorer.
- `eventId`, `expectedScoreVersion` — required, see *Recording safely on a bad network*.

The `goalScorers` entry stores `assistedBy`, `eventId`, `recordedBy` (the referee roster entry) and `recordedAt`.

**Success Response** `200 OK`: Updated match document with full population (same structure as `GET /matches/details/:matchId`). Also `200`, with nothing changed, when this `eventId` was already applied.

**Error Responses**:
- `400` — match is not live; the match has no referee; the player isn't on the team named; or the assist isn't from a teammate
- `403` — caller isn't this match's referee
- `404` — match not found
- `409` — `expectedScoreVersion` is out of date; `details` has the current score

---

### POST /matches/end/:matchId
End a live match, record the result, and create the next game. Only the person **recording this match** may call this — see *Who can record a match* above.

The finished match gets a `resultStatus` from whoever was refereeing at full time: no referee → `UNOFFICIAL`; referee on their own phone → `CONFIRMED`; Referee mode on a captain's phone → `PENDING_CONFIRMATION` (see `POST /matches/:matchId/confirm`). The referee carries over to the next game if still eligible (their own team isn't coming on); otherwise the next game starts with no referee.

The next game follows the session's `rotationFormat` (see `POST /sessions/create/:sessionId`). It is created with `status: "SCHEDULED"` and the next `sequence`. No next game is created once the session's `stopTime` has passed, or for matches created before rotation existed.

**Auth required**: Yes (JWT cookie, see *Who can record a match*)

**Stats:** when the result counts (`CONFIRMED`, or `PENDING_CONFIRMATION`), every player's stats are written straight away — see **Stats**. For `PENDING_CONFIRMATION`, `reviewUntil` is set 24 hours after the end and the players allowed to dispute get a `MATCH_RESULT_REVIEW` push.

**Request Body**:
```json
{ "expectedScoreVersion": 5, "penaltyWinner": "teamTwo" }
```
- `expectedScoreVersion` — **required**: the `scoreVersion` the recorder saw when they pressed end. If a goal landed after that, the end is refused (`409`) so they see it first.
- `penaltyWinner` — **required** when the score is level, the session is `winner_stays` and its `winningDecider` is `penalties`. Rejected in every other case.

Ending a match that already ended at the same `scoreVersion` (a retry, or two taps at once) returns `200` with the same result and the same `next` game — nothing is created twice.

**Success Response** `200 OK`:
```json
{
  "message": "Final Score- Team 1:2 vs Team 2:1",
  "match": { "...": "finished match, with winner and decidedBy" },
  "next": { "...": "the next game (SCHEDULED), or null when time is up" }
}
```

**Error Responses**:
- `400` — match is not live; draw without `penaltyWinner` when penalties are required; or `penaltyWinner` sent when it isn't allowed
- `403` — caller isn't allowed to record this match (see *Who can record a match*)
- `404` — match or session not found
- `409` — the score changed since the recorder's screen loaded (`details` has the current score), the referee was handed off at the same moment, or the match already ended at a different `scoreVersion`. Nothing was changed.

---

### PUT /matches/increment-score/:matchId
Add a goal **without a scorer**: the scoreboard for a match with no referee, or a referee who didn't see who scored. Only the person **recording this match** may call this — see *Who can record a match* above.

**Auth required**: Yes (JWT cookie, see *Who can record a match*)

**Query Parameters**:
- `team`: `"teamOne"` | `"teamTwo"`

**Request Body**:
```json
{ "eventId": "6f1c2a9e-1b7d-4c55-9a4e-2f0b8a3c7d11", "expectedScoreVersion": 2 }
```
See *Recording safely on a bad network*.

**Example**: `PUT /matches/increment-score/507f...?team=teamOne`

**Success Response** `200 OK`: Updated match document (full population). Also `200`, with nothing changed, when this `eventId` was already applied.

**Error Responses**:
- `400` — match is not live, or `team` is invalid
- `403` — caller isn't allowed to record this match (see *Who can record a match*)
- `404` — match or session not found
- `409` — `expectedScoreVersion` is out of date; `details` has the current score

---

### PUT /matches/decrement-score/:matchId
**Undo** the most recent goal for a team. Its `goalScorers` entry (scorer and assist) is removed too, so an undone goal never reaches stats. Only the person **recording this match** may call this — see *Who can record a match* above.

**Auth required**: Yes (JWT cookie, see *Who can record a match*)

**Query Parameters**:
- `team`: `"teamOne"` | `"teamTwo"`

**Request Body**:
```json
{ "eventId": "0b7e…", "expectedScoreVersion": 3 }
```
See *Recording safely on a bad network*. Because `scoreVersion` moves on every undo, a delayed retry of the goal that was undone can't bring it back.

**Success Response** `200 OK`: Updated match document (full population). Also `200`, with nothing changed, when this `eventId` was already applied.

**Error Responses**:
- `400` — match is not live, the team has no goal to undo, or `team` is invalid
- `403` — caller isn't allowed to record this match (see *Who can record a match*)
- `404` — match or session not found
- `409` — `expectedScoreVersion` is out of date; `details` has the current score

---

### GET /matches/stream/:matchId (SSE)
Real-time score stream for a single match.

**Auth required**: Yes (JWT cookie)

**Headers**: `Accept: text/event-stream`, `Cache-Control: no-cache`

**Events**:
```
// On connect
data: {"type":"connected","message":"Connection established","matchId":"...","userId":"...","timestamp":1234567890}

// Match started (POST /matches/start)
data: {"type":"match_started","matchId":"...","sessionId":"...","sequence":2,"teamOne":{"id":"...","name":"Team A"},"teamTwo":{"id":"...","name":"Team C"},"referee":"507f..." | null,"startedAt":"2026-10-26T18:00:00.000Z"}

// Score changed (a goal via increment-score, or an undo via decrement-score)
data: {"type":"score","matchId":"...","sessionId":"...","teamOne":{"id":"...","name":"Team A"},"teamTwo":{"id":"...","name":"Team C"},"teamOneScore":3,"teamTwoScore":1,"scoreVersion":4}

// Goal with a scorer (POST /matches/goal-scorer)
data: {"type":"score", ...same as above..., "latestScorer":{"player":"507f...","team":"teamOne"}}

// Full time (POST /matches/end) — with the game created to follow it
data: {
  "type": "match_finished", "matchId": "...", "sessionId": "...", "sequence": 2,
  "teamOne": {"id":"...","name":"Team A"}, "teamTwo": {"id":"...","name":"Team C"},
  "teamOneScore": 3, "teamTwoScore": 1, "scoreVersion": 4,
  "winner": "<team id>" | null, "decidedBy": "NORMAL_TIME" | "PENALTIES" | "DRAW", "penaltyWinner": "teamTwo",
  "resultStatus": "CONFIRMED" | "PENDING_CONFIRMATION" | "UNOFFICIAL",
  "next": {"matchId":"...","sequence":3,"teamOne":{"id":"...","name":"Team A"},"teamTwo":{"id":"...","name":"Team B"},"referee":"507f..." | null} | null
}

// Referee assigned, handed off or removed (PUT / DELETE /matches/:matchId/referee)
data: {"type":"referee_changed","matchId":"...","sessionId":"...","referee":"507f..." | null,"by":"<user id>"}

// Heartbeat (every 30s)
data: {"type":"heartbeat","timestamp":1234567890}
```

- `score` events carry the **full current score** — replace what's on screen, never add to it — and the match's new `scoreVersion`.
- `match_finished.next` is the game created to follow it (`null` when the session's time is up). Each event is sent once: retried start/end requests don't repeat them.
- `referee` values are referee roster entry ids (see [Referees](#referees)).

**Error Responses**:
- `429` — this user already has 10 open match streams, or 500 people are watching this match

---

### GET /matches/stream/session/:sessionId (SSE)
Real-time score stream for all matches in a session.

**Auth required**: Yes (JWT cookie)

**Headers**: `Accept: text/event-stream`, `Cache-Control: no-cache`

**Events**: Same shape as single match stream, filtered to the given session.

---

### GET /matches/stream (SSE)
Real-time score stream for all matches globally.

**Auth required**: Yes (JWT cookie)

**Headers**: `Accept: text/event-stream`, `Cache-Control: no-cache`

**Events**: Same shape as single match stream, all matches included.

---

### GET /matches/connections/stats
Get current SSE connection statistics.

**Auth required**: Yes (JWT cookie)

**Success Response** `200 OK`: Connection stats object.

---

### PUT /matches/:matchId/referee
Assign a referee to a match before kick-off, or hand off to someone else mid-match. The new referee takes over recording straight away; the old one loses it.

**Auth required**: Yes (JWT cookie). Any **session captain**, the **pitch owner**, or the **current referee** handing over.

**Request Body**:
```json
{ "refereeId": "507f..." }
```
- `refereeId` — a roster entry id from `GET /referees/:sessionId`.

The referee must be eligible: `ACCEPTED`, on this session's list, **not a player on either team in this match**, and not refereeing another live match.

**Success Response** `200 OK`: Updated match document.

**Error Responses**:
- `400` — referee not eligible (see above), or the match has finished
- `403` — caller can't change this match's referee
- `404` — match or referee not found
- `409` — someone else changed the referee at the same moment. Refresh and try again.

---

### DELETE /matches/:matchId/referee
Remove the referee. The match carries on **unofficiated**: either playing team can run the scoreboard, goal scorers are rejected, and the result is `UNOFFICIAL`.

**Auth required**: Same as `PUT /matches/:matchId/referee`.

**Success Response** `200 OK`: Updated match document.

**Error Responses**: same as `PUT /matches/:matchId/referee`.

---

### POST /matches/:matchId/confirm
### POST /matches/:matchId/dispute
Review a result recorded in Referee mode on a captain's phone (`resultStatus: PENDING_CONFIRMATION`). Those requests arrive with the captain's login, so the server can't tell the referee's taps from the captain's. The result **counts toward stats straight away**; the other side can dispute it until `reviewUntil` (24 hours after the end). The players allowed to respond get a `MATCH_RESULT_REVIEW` push when the match ends.

- **Confirm** → `CONFIRMED`. Stats don't change; it already counts.
- **Dispute** → `DISPUTED`. Every player's stats from this match are taken back out (marked void) until it's reviewed.
- Nobody responds → the result becomes `CONFIRMED` when the window closes.

**Auth required**: Yes (JWT cookie). A **player on the team opposing the captain whose phone was used**. If that captain's team wasn't in the match, a player from either team. Never that captain.

**Success Response** `200 OK`: Updated match document with `resultStatus` `CONFIRMED` or `DISPUTED`.

**Error Responses**:
- `400` — the result isn't waiting for review, or the review window has closed
- `403` — caller can't confirm this result
- `404` — match not found
- `409` — already confirmed or disputed by someone else

---

## Referees

A session has a **referee list** (roster). People agree once per session, then a captain, the owner or the outgoing referee assigns them to individual matches with `PUT /matches/:matchId/referee`. Someone can only referee a match their own team isn't playing in, so the role moves between people as teams rotate.

Two ways to referee:
- **`OWN_PHONE`** — an i-One user, invited by a captain, who accepts on their own phone.
- **`CAPTAIN_DEVICE`** (Referee mode) — the captain enters the referee's name and phone number and hands over their phone. Accepted straight away. If the number belongs to an i-One account, the matches count toward that person's referee history. Results count straight away, and the other side has 24 hours to dispute them (`POST /matches/:matchId/dispute`).

**Roster entry**:
```json
{
  "_id": "507f...",
  "session": "507f...",
  "user": { "_id": "507f...", "firstName": "Tola", "lastName": "Adebayo", "nickname": "tolaref" },
  "guestName": "Kunle",
  "mode": "OWN_PHONE",
  "deviceOwner": "507f...",
  "status": "ACCEPTED",
  "invitedBy": "507f...",
  "respondedAt": "2026-10-23T17:55:00.000Z"
}
```
- `user` — populated in `GET /referees/:sessionId`; an id elsewhere. Missing for a Referee-mode guest with no account.
- `guestName`, `deviceOwner` — `CAPTAIN_DEVICE` only.
- `status` — `INVITED`, `ACCEPTED` or `DECLINED`.
- A guest's phone number is stored but **never returned**.

---

### POST /referees/:sessionId/invite
Invite an i-One user to referee this session on their own phone. Sends them a `REFEREE_INVITE` push with `payload: { sessionId, refereeId }`. Someone who declined can be invited again.

**Auth required**: Yes (JWT cookie, session captain)

**Request Body**:
```json
{ "userId": "507f..." }
```

**Success Response** `201 Created`: Roster entry (`INVITED`).

**Error Responses**:
- `400` — session is closed (cancelled, completed or refunded), or this person already has an open invite or is on the list
- `403` — caller isn't a captain of this session
- `404` — session or user not found

---

### POST /referees/:refereeId/accept
### POST /referees/:refereeId/decline
Answer a referee invite. The "you're at the pitch" check on the invite screen is done in the app; the server doesn't verify location.

**Auth required**: Yes (JWT cookie, the invited user)

**Success Response** `201 Created`: Roster entry (`ACCEPTED` or `DECLINED`).

**Error Responses**:
- `400` — invite already answered, or session is closed
- `404` — invite not found (or it isn't yours)

---

### POST /referees/:sessionId/device
Start Referee mode on the captain's phone: add the referee by name and phone number. Accepted straight away, with `deviceOwner` set to the caller. Adding the same person again updates their entry instead of creating a second one.

**Auth required**: Yes (JWT cookie, session captain)

**Request Body**:
```json
{ "guestName": "Kunle Bello", "guestPhone": "+234 803 412 7788" }
```
- `guestPhone` — a Nigerian number. Spaces and dashes are allowed.

**Success Response** `201 Created`: Roster entry (`CAPTAIN_DEVICE`, `ACCEPTED`), without the phone number.

**Error Responses**:
- `400` — invalid phone number, session closed, or this person is already refereeing this session on their own phone
- `403` — caller isn't a captain of this session
- `404` — session not found

---

### GET /referees/:sessionId
The session's referee list, oldest first.

**Auth required**: Yes (JWT cookie). Session members, captains, the pitch owner, and anyone on the list.

**Success Response** `200 OK`: Array of roster entries with `user` populated.

**Error Responses**:
- `403` — caller isn't part of this session
- `404` — session not found

---

### GET /referees/history/:userId
How many sessions this person has refereed: distinct sessions with a finished match they refereed, including matches they handed off part-way through. Feeds "refereed 4 sessions" on the referee picker.

**Auth required**: Yes (JWT cookie)

**Success Response** `200 OK`:
```json
{ "userId": "507f...", "refereedSessions": 4 }
```

**Error Responses**:
- `400` — invalid user id

---

## Tournaments

Tournaments are per-location competitions that run as either a **knockout** (single-elimination bracket) or a **league** (round-robin with a standings table) — selected via `type` at creation time. The organizer creates the tournament, teams register, then the organizer starts it: this generates a knockout bracket (random draw) or a full round-robin fixture list + standings table, depending on `type`. Results are recorded match-by-match and the bracket/table updates atomically and incrementally — no full recompute on every result.

### Status flow
`registration` → `started` → `completed`

### Tournament types
- **`knockout`** — single elimination bracket. Supported sizes: **8, 16, or 32 teams**. Winners advance automatically when scores are recorded; the organizer can also manually advance a team (for draws / overrides — see `/advance`). Draws are rejected on `/result`.
- **`league`** — single round-robin. Any `maxTeams >= 2`. Every team plays every other team once; results (including draws) feed directly into a live standings table (3 points for a win, 1 for a draw). The table-topper is set as `winner` once the final fixture is recorded. `/advance` does not apply to leagues.

### Bracket structure (knockout)
Each match in `bracket` has:
- `matchIndex` — sequential 0-based ID used in all match endpoints
- `round` / `roundName` — e.g. `1` / `"Quarter-final"`
- `home` / `away` — `{ teamId, name, logo }` (null until bracket is filled)
- `homeScore` / `awayScore` — null until recorded
- `winner` — populated after result is recorded
- `scheduledTime` — set by organizer, null by default
- `nextMatchIndex` / `nextMatchSlot` — where the winner goes next (null for the final)

### Fixtures & standings structure (league)
Each fixture in `fixtures` has:
- `matchIndex` — sequential 0-based ID used in all match endpoints
- `round` — 1-based matchday number
- `home` / `away` — `{ teamId, name, logo }`
- `homeScore` / `awayScore` — null until recorded
- `completed` — boolean
- `scheduledTime` — set by organizer, null by default

Each row in `standings` (one per registered team, kept sorted client-side by `points` → `goalDifference` → `goalsFor`):
- `teamId`, `name`, `logo`
- `played`, `wins`, `draws`, `losses`
- `goalsFor`, `goalsAgainst`, `goalDifference`
- `points`

`totalFixtures` / `completedFixtures` track overall progress (used internally to detect when the league is complete).

---

### POST /tournaments/create/:locationId
Create a tournament at a location. Only authenticated users can create.

**Auth required**: Yes (JWT cookie)

**Path Parameters**:
- `locationId` — the location this tournament belongs to

**Request Body** (knockout example):
```json
{
  "name": "Victoria Island Cup",
  "description": "Annual VI knockout tournament",
  "type": "knockout",
  "prizeMoney": 50000000,
  "registrationFee": 200000,
  "minutesPerMatch": 10,
  "playersPerTeam": 5,
  "maxTeams": 8,
  "pitches": ["Royal Turf, Ikate", "Top Boys Turf, Igando"],
  "teamPrizes": ["500,000", "Team Bus"],
  "playerPrizes": ["Award", "100,000"],
  "rules": ["3 Points For Wins, 1 Point For Draws"],
  "registrationDeadline": "2026-05-01T00:00:00.000Z",
  "startDate": "2026-05-10T09:00:00.000Z",
  "durationDays": 2
}
```

**Request Body** (league example — only `type` and `maxTeams` differ in meaning):
```json
{
  "name": "Sangotedo League",
  "type": "league",
  "prizeMoney": 30000000,
  "registrationFee": 100000,
  "minutesPerMatch": 30,
  "playersPerTeam": 6,
  "maxTeams": 6,
  "registrationDeadline": "2026-05-01T00:00:00.000Z",
  "startDate": "2026-05-10T09:00:00.000Z",
  "durationDays": 14
}
```

**Field Notes**:
- `type`: `"knockout"` | `"league"` — determines bracket-vs-table behavior on `/start`
- `maxTeams`: **must be `8`, `16`, or `32`** for `knockout`; any value `>= 2` for `league`
- `minutesPerMatch` / `playersPerTeam` — informational match-format settings shown in the tournament setup
- `pitches`, `teamPrizes`, `playerPrizes`, `rules` — free-text arrays for venue names, prize line items, and tournament rules (all optional, default `[]`)
- `endDate` is auto-computed (`startDate + durationDays`)
- A unique 6-character `code` is auto-generated (uppercase alphanumeric)

**Success Response** `201 Created`: Full tournament document with `status: "registration"`.

---

### GET /tournaments/location/:locationId
Get all tournaments for a location. Lightweight — no team population.

**Auth required**: Yes (JWT cookie)

**Success Response** `200 OK`:
```json
[
  {
    "_id": "507f...",
    "name": "Victoria Island Cup",
    "status": "registration",
    "type": "knockout",
    "maxTeams": 8,
    "registeredTeams": ["507f...", "507f..."],
    "startDate": "2026-05-10T09:00:00.000Z",
    "endDate": "2026-05-12T09:00:00.000Z",
    "registrationDeadline": "2026-05-01T00:00:00.000Z",
    "prizeMoney": 50000000,
    "registrationFee": 200000,
    "code": "AB1C2D",
    "winner": null
  }
]
```

---

### GET /tournaments/:id
Get full tournament details — bracket or fixtures/standings (depending on `type`), registered teams (name + logo), and organizer info. Single query, no N+1.

**Auth required**: Yes (JWT cookie)

**Note**: `registeredTeams` never includes each team's join `code` — see `GET /tournaments/code/:code` for why.

**Success Response** `200 OK` (knockout):
```json
{
  "_id": "507f...",
  "name": "Victoria Island Cup",
  "status": "started",
  "type": "knockout",
  "maxTeams": 8,
  "bracket": [
    {
      "matchIndex": 0,
      "round": 1,
      "roundName": "Quarter-final",
      "home": { "teamId": "507f...", "name": "Team Alpha", "logo": "" },
      "away": { "teamId": "507f...", "name": "Team Beta", "logo": "" },
      "homeScore": null,
      "awayScore": null,
      "winner": null,
      "completed": false,
      "scheduledTime": null,
      "nextMatchIndex": 4,
      "nextMatchSlot": "home"
    }
  ],
  "registeredTeams": [
    { "_id": "507f...", "name": "Team Alpha", "logo": "", "captain": "507f..." }
  ],
  "organizer": { "_id": "507f...", "firstName": "Kiara", "lastName": "Schulist" },
  "winner": null
}
```

**Success Response** `200 OK` (league):
```json
{
  "_id": "507f...",
  "name": "Sangotedo League",
  "status": "started",
  "type": "league",
  "maxTeams": 6,
  "fixtures": [
    {
      "matchIndex": 0,
      "round": 1,
      "home": { "teamId": "507f...", "name": "Team Alpha", "logo": "" },
      "away": { "teamId": "507f...", "name": "Team Beta", "logo": "" },
      "homeScore": null,
      "awayScore": null,
      "completed": false,
      "scheduledTime": null
    }
  ],
  "standings": [
    {
      "teamId": "507f...",
      "name": "Team Alpha",
      "logo": "",
      "played": 0,
      "wins": 0,
      "draws": 0,
      "losses": 0,
      "goalsFor": 0,
      "goalsAgainst": 0,
      "goalDifference": 0,
      "points": 0
    }
  ],
  "registeredTeams": [
    { "_id": "507f...", "name": "Team Alpha", "logo": "", "captain": "507f..." }
  ],
  "organizer": { "_id": "507f...", "firstName": "Kiara", "lastName": "Schulist" },
  "winner": null
}
```

---

### GET /tournaments/code/:code
Look up a tournament by its player-facing discovery code (`Tournament.code`, generated at creation). Same response shape as `GET /tournaments/:id`. Case-insensitive — the code is normalized to uppercase before lookup.

**Auth required**: Yes (JWT cookie)

**Note**: `registeredTeams` in the response never includes each team's join `code` — that would let any authenticated user join any team. A team's `code` is only ever returned once, in the `POST /tournaments/:id/team` response to its captain.

**Error Responses**:
- `404` — no tournament matches that code

---

### POST /tournaments/:id/team
Create a team and register it to the tournament in one step. Only valid during `registration` status. **Captains register their own team** — `captainId` must match the authenticated user.

The team is created with **only the captain as a member** — there is no roster input here. The response includes a generated join `code`; the captain shares it privately with intended teammates, who each self-add via `POST /tournaments/team/join`.

**Auth required**: Yes (JWT cookie, captain only — `captainId` must equal the calling user's ID)

**Request Body**:
```json
{
  "teamName": "Team Alpha",
  "logo": "https://...",
  "captainId": "507f..."
}
```

**Field Notes**:
- `logo` is optional
- No `playerIds` field — teammates join individually via `POST /tournaments/team/join`, not upfront at creation

**Success Response** `201 Created`:
```json
{
  "_id": "507f...",
  "name": "Team Alpha",
  "logo": "",
  "captain": "507f...",
  "players": ["507f..."],
  "code": "K7X9QZ",
  "tournamentId": "507f..."
}
```

**Error Responses**:
- `403` — `captainId` does not match the authenticated user
- `400` — tournament full or not in registration phase, or the captain is already registered to another team in this tournament
- `404` — tournament or captain not found

---

### POST /tournaments/team/join
Join an existing team using the `code` its captain shared. Self-service — replaces needing every teammate's ID upfront at team creation. Not nested under a tournament ID; the code alone resolves both the team and its tournament.

**Auth required**: Yes (JWT cookie)

**Request Body**:
```json
{ "code": "K7X9QZ" }
```

**Error Responses**:
- `404` — code doesn't match any team, or the team is no longer registered to a tournament (e.g. its captain unregistered it after the code was shared)
- `400` — tournament is not in `registration` phase, caller is already on this team, the team is full (`playersPerTeam` reached), or caller is already registered to a different team in this tournament

---

### POST /tournaments/:id/team/:teamId/pay
Initialize a Paystack checkout for the team's registration fee. Only needed when `registrationFee > 0`. Returns a URL the captain should be redirected to.

**Auth required**: Yes (JWT cookie)

**Path Parameters**:
- `id` — tournament ID
- `teamId` — team ID

**Success Response** `201 Created`:
```json
{
  "authorizationUrl": "https://checkout.paystack.com/...",
  "reference": "TOURNEY_REG_<tournamentId>_<teamId>_<uuid>",
  "amount": 200000
}
```

**Notes**:
- Redirect the captain to `authorizationUrl` to complete payment (supports bank transfer, card, etc.)
- After payment, Paystack fires `POST /webhooks/paystack` and the server credits the location owner's wallet automatically

**Error Responses**:
- `404` — no pending registration payment found for this team (either already paid or `registrationFee` is 0)

---

### GET /tournaments/:id/team/:teamId/payment-status
Get the registration fee payment status for a team.

**Auth required**: Yes (JWT cookie)

**Path Parameters**:
- `id` — tournament ID
- `teamId` — team ID

**Success Response** `200 OK`:
```json
{
  "status": "PENDING",
  "amount": 200000,
  "reference": "TOURNEY_REG_...",
  "paidAt": null
}
```

Returns `null` if the tournament has no registration fee.

---

### DELETE /tournaments/:id/team/:teamId
Remove a team from the tournament. Only valid during `registration` status. Callable by the **team's captain** or the **tournament organizer**.

**Auth required**: Yes (JWT cookie, team captain or tournament organizer)

**Error Responses**:
- `403` — caller is neither the team's captain nor the tournament organizer
- `400` — tournament has already started
- `404` — tournament or team not found

---

### DELETE /tournaments/team/leave
Leave your current team. Self-service, for non-captain members only — captains must use `DELETE /tournaments/:id/team/:teamId` to unregister the whole team instead. Only valid during `registration` status.

**Auth required**: Yes (JWT cookie)

**Success Response** `200 OK`:
```json
{ "message": "You have left the team" }
```

**Error Responses**:
- `400` — caller is the team's captain, or the tournament has already started
- `404` — caller is not on any team

---

### POST /tournaments/:id/start
Generate the competition structure from registered teams (random draw). Only the organizer can call this. Requires at least 2 registered teams.
- **knockout** — generates the bracket. Teams fewer than `maxTeams` receive byes (auto-advance in round 1).
- **league** — generates a single round-robin fixture list (every team plays every other team once; an odd number of teams gets a bye each matchday) and a zero-initialized standings table.

**Auth required**: Yes (JWT cookie)

**Success Response** `200 OK` (knockout):
```json
{ "message": "Tournament started", "bracket": [ ...all matches... ] }
```

**Success Response** `200 OK` (league):
```json
{ "message": "Tournament started", "fixtures": [ ...all matchdays... ], "standings": [ ...zeroed table... ] }
```

**Error Responses**:
- `400` — fewer than 2 teams, or tournament already started
- `403` — not the organizer

---

### PATCH /tournaments/:id/match/:matchIndex/result
Record a match score.
- **knockout** — the winner is automatically determined and placed into the next match slot. If it's the final, the tournament is marked `completed` and `winner` is set. Draws are **rejected** — use `/advance` to manually pick the winner.
- **league** — draws are **allowed**. The fixture and both teams' standings rows (`played`, `wins`/`draws`/`losses`, goals, `points`) update atomically in a single `$inc` — the table is never recomputed from scratch. Once the last fixture is recorded, the tournament is marked `completed` and `winner` is set to the table-topper (ranked by points → goal difference → goals scored).

**Auth required**: Yes (JWT cookie, organizer only)

**Request Body**:
```json
{ "homeScore": 3, "awayScore": 1 }
```

**Field Notes**:
- Single atomic DB update — no extra queries (league completion adds one follow-up read+write, only on the final fixture)

**Success Response** `200 OK` (knockout):
```json
{ "message": "Result recorded", "winner": { "teamId": "507f...", "name": "Team Alpha", "logo": "" }, "isFinal": false }
```

**Success Response** `200 OK` (league):
```json
{ "message": "Result recorded", "isFinal": false }
```

**Error Responses**:
- `400` — draw in a knockout match, match/fixture already completed, or not ready (waiting for both teams)
- `403` — not the organizer

---

### PATCH /tournaments/:id/match/:matchIndex/advance
**Knockout only.** Manually pick the winner of a match (for draws, penalties, or organizer override). Winner advances to the next round automatically. Returns `400` if called on a league tournament — leagues accept draws as valid results and have no bracket progression.

**Auth required**: Yes (JWT cookie, organizer only)

**Request Body**:
```json
{ "winner": "home" }
```

- `winner`: `"home"` | `"away"`

**Success Response** `200 OK`:
```json
{ "message": "Team advanced", "winner": { "teamId": "507f...", "name": "Team Alpha", "logo": "" }, "isFinal": false }
```

---

### PATCH /tournaments/:id/match/:matchIndex/schedule
Set the scheduled time for a bracket match (knockout) or fixture (league). Organizer only.

**Auth required**: Yes (JWT cookie, organizer only)

**Request Body**:
```json
{ "scheduledTime": "2026-05-10T14:00:00.000Z" }
```

**Success Response** `200 OK`: `{ "message": "Match scheduled" }`

---

### GET /tournaments/stream/:id (SSE)
Real-time tournament updates — bracket progress (knockout) or fixtures/standings progress (league) — pushed live as the organizer records results, advances teams, schedules matches, or the tournament starts/completes. Same Redis pub/sub → SSE pipeline as `/matches/stream/session/:sessionId`, on its own channel, so clients don't have to poll `GET /tournaments/:id`.

**Auth required**: Yes (JWT cookie)

**Headers**: `Accept: text/event-stream`, `Cache-Control: no-cache`

**Connected handshake** (sent immediately on connect):
```json
{
  "type": "connected",
  "message": "Tournament stream connected",
  "tournamentId": "<id>",
  "userId": "<id>",
  "timestamp": 1716470400000
}
```

**Update event shape**:
```json
{
  "tournamentId": "<id>",
  "locationId": "<id>",
  "status": "registration | started | completed",
  "event": "started | result | advance | scheduled | completed",
  "matchIndex": 3,
  "homeScore": 2,
  "awayScore": 1,
  "winner": { "teamId": "<id>", "name": "Team A", "logo": "<url>" },
  "isFinal": false,
  "scheduledTime": "2026-05-10T14:00:00.000Z"
}
```
Fields are populated according to the `event` type — e.g. `result` carries `matchIndex`/`homeScore`/`awayScore`/`isFinal` (plus `winner` for knockout), `scheduled` carries `matchIndex`/`scheduledTime`, `completed` carries the final `winner`. A heartbeat (`{ "type": "heartbeat", ... }`) is sent every 30 seconds to keep the connection alive.

---

## Stats

### GET /stats/season
The signed-in user's own stats. Same response as `GET /stats/:userId`.

**Auth required**: Yes (JWT cookie)

**Query Parameters**:
- `season` (optional) — a year, e.g. `2026`. Leave out for all-time totals.

---

### GET /stats/:userId
Any user's stats — public profile lookup, not scoped to the caller.

**Auth required**: Yes (JWT cookie — just needs to be logged in, viewing someone else's stats is allowed)

**Path Parameters**:
- `userId` — the user whose stats to fetch

**Query Parameters**:
- `season` (optional) — a year, e.g. `2026` (the match's end date, Lagos time). Leave out for all-time totals.

**Success Response** `200 OK`:
```json
{
  "userId": "507f...",
  "season": 2026,
  "totalMatches": 14,
  "goals": 9,
  "assists": 4,
  "wins": 8,
  "draws": 2,
  "losses": 4,
  "cleanSheets": 3,
  "playerOfSessionAwards": 2
}
```
- `season` — `null` for all-time totals.
- A penalty-shootout win counts in `wins`; shootout goals never count in `goals`.
- `playerOfSessionAwards` — Player of the Session wins (see **Voting**). A shared award counts for each winner. With `season`, counts awards from votes that opened in that year.
- `cleanSheets` — **defenders only**: counted matches where the player's team conceded nothing while the player's profile position was Defender (`DF`). The position is saved with each match when it's counted, so changing position later never changes past clean sheets. Matches counted before positions were saved have no clean sheets.

**Error Responses**:
- `400` — invalid user id, or `season` isn't a year

---

### GET /stats/:userId/rating
The profile rating (out of 10) and how it's made. Public like stats.

**Auth required**: Yes (JWT cookie)

**Success Response** `200 OK`:
```json
{
  "userId": "507f...",
  "rating": 5.7,
  "window": { "sessions": 12, "of": 20 },
  "totals": {
    "goals": 14, "assists": 8, "cleanSheets": 0,
    "gamesPlayed": 20, "gamesWon": 12, "setWinPct": 60,
    "sessionsWon": 5, "sessionWinPct": 41.7,
    "voteSharePct": 18, "votesCounted": 9,
    "contributionsPerSession": 1.8
  },
  "components": [
    { "key": "contribution", "score": 2.1, "max": 3.5 },
    { "key": "setWin", "score": 1.2, "max": 2 },
    { "key": "sessionWin", "score": 0.6, "max": 1.5 },
    { "key": "votes", "score": 1.2, "max": 2 },
    { "key": "experience", "score": 0.6, "max": 1 }
  ],
  "playerOfSessionAwards": 3
}
```

**How it's made** — over the player's **last 20 sessions** with a counted match (refereed, not disputed), the one that just finished included. Each part is how far the player is toward that part's cap, times its weight:

| Part | Max | Calculation |
|---|---|---|
| `contribution` | 3.5 | (goals + assists + clean sheets) per session ÷ 3, capped. Clean sheets only exist for defenders, so for everyone else this is goals + assists. |
| `setWin` | 2 | games won ÷ games played. A penalty-shootout win is a win. |
| `sessionWin` | 1.5 | sessions where the player's team won **more games than every other team** ÷ sessions. A tie for most wins counts for nobody. |
| `votes` | 2 | average share of Player of the Session votes ÷ 30%, capped. Every closed vote counts whatever the turnout; sessions with no vote, or nobody voting, are left out. |
| `experience` | 1 | sessions played ÷ 20, capped. |

- `rating` is the sum, rounded to one decimal; `null` until the player has a counted session. There's no minimum number of sessions — a new player can score high on a small sample.
- `totals` and `window` are for the same 20 sessions (the all-time numbers are on `GET /stats/:userId`). Percentages are 0–100.
- Worked out on every request, so it's always current.

**Error Responses**:
- `400` — invalid user id

---

**Where the numbers come from.** Stats are never self-reported and there is no endpoint to edit them. When a match result counts (see `resultStatus` under `GET /matches/details/:matchId`), one record per player is written: goals and assists from `goalScorers`, goals conceded, and won/drawn/lost. Records are never edited; the totals above are added up from them every time. A disputed result's records are marked void and drop out of the totals. A background job checks every minute for counted matches whose records weren't written (e.g. a crash mid-request) and writes them, and closes review windows that have run out.

Not counted: matches with no referee (`UNOFFICIAL`), matches from before referees existed, and tournament matches. The old stored stats counters are no longer read.

---

## Voting — Player of the Session

After a session, the players vote for the best player.

- **Opens** when the session is over — the captain or owner ended it, or `stopTime` passed — and no match is still live. A background job checks every minute, so it opens within a minute of that.
- **Who votes, and who can be voted for:** every player on a team that played at least one finished match in the session. Fixed when voting opens. Referees and spectators don't vote.
- **Runs for 2 hours.** One vote each, never for yourself, and **final** — it can't be changed. There is no "skip" to send: a player who doesn't vote just doesn't count toward turnout.
- **Anonymous:** the server stores who voted (to stop double votes), but the API never returns it — only turnout, your own vote, and after closing the totals.
- **Result** is counted shortly after closing (within about a minute and a half): the most votes wins, **a tie shares the award**, and **no award if fewer than 40% of eligible players voted**.
- Pushes: `SESSION_VOTE_OPEN` when it opens, `SESSION_VOTE_RESULT` when the result is in, to every eligible player.

### GET /votes/:sessionId
The vote screens: candidates, turnout, your vote, and the result once counted.

**Auth required**: Yes (JWT cookie)

**Success Response** `200 OK`:
```json
{
  "sessionId": "507f...",
  "status": "OPEN",
  "opensAt": "2026-10-23T19:00:00.000Z",
  "closesAt": "2026-10-23T21:00:00.000Z",
  "eligibleCount": 10,
  "votesCast": 7,
  "myVote": "507f...",
  "canVote": false,
  "candidates": [
    {
      "user": { "_id": "507f...", "firstName": "Chidi", "lastName": "Okafor", "nickname": "chidi", "position": "ST" },
      "goals": 2,
      "assists": 1
    }
  ],
  "result": null
}
```
- `status` — `OPEN` until `closesAt`, then `CLOSED`.
- `myVote` — the candidate you voted for, or `null`. `canVote` — you're eligible, it's open, and you haven't voted.
- `candidates` — every eligible player, including you (the app greys you out). `goals`/`assists` are from this session's counted matches only (officiated, not disputed) — the same records as **Stats**.
- `result` — `null` until the result is counted, even just after `closesAt`. Then:
```json
{
  "outcome": "AWARDED",
  "winners": ["507f..."],
  "votesCast": 9,
  "eligibleCount": 10,
  "minTurnout": 0.4,
  "tallies": [
    { "candidate": "507f...", "votes": 5, "percent": 56 },
    { "candidate": "507f...", "votes": 3, "percent": 33 },
    { "candidate": "507f...", "votes": 1, "percent": 11 }
  ]
}
```
  - `outcome` — `AWARDED`, or `NO_AWARD` (turnout under `minTurnout`, or nobody voted). Tallies are still shown for `NO_AWARD`.
  - `winners` — more than one on a tie.
  - `tallies` — most votes first; `percent` is of votes cast.

**Error Responses**:
- `400` — invalid session id
- `404` — voting for this session hasn't opened (session not over, a match still live, or no finished matches)

---

### POST /votes/:sessionId
Cast your vote.

**Auth required**: Yes (JWT cookie, an eligible player)

**Request Body**:
```json
{ "candidateId": "507f..." }
```

**Success Response** `201 Created`: Same as `GET /votes/:sessionId`. Sending the **same** vote again (a retry after a lost response) also succeeds and changes nothing.

**Error Responses**:
- `400` — voting has closed, you voted for yourself, or that player didn't play in this session
- `403` — you didn't play in this session
- `404` — voting for this session hasn't opened
- `409` — you've already voted for someone else; votes can't be changed

---

## Badges

Badges a player unlocks. Each one is **once ever** and **private** to the player until they share it.

| Badge | How it's unlocked |
|---|---|
| `LICENCE_TO_MISS` ("007") | 7 sessions in a row with **no goal and no assist**. Only counted matches (refereed, not disputed) count; a session with no counted match doesn't extend or break the run. |

**When it's checked:** once per session, when the session is over (the same moment Player of the Session voting opens), and only for players who had no goal or assist in that session. Nothing runs between sessions.

**The pop-up:** on unlock the player gets a `BADGE_UNLOCKED` notification on the in-app stream (SSE) **and** as a push, with `payload: { badgeId, badge, sessions, goals, assists }`. If they missed it, `GET /badges/me` returns it with `seenAt: null`; show the pop-up, then call `POST /badges/:badgeId/seen`.

**Badge object**:
```json
{
  "_id": "507f...",
  "user": "507f...",
  "badge": "LICENCE_TO_MISS",
  "unlockedAt": "2026-10-26T20:01:00.000Z",
  "sessions": ["507f...", "..."],
  "seenAt": null,
  "shared": false
}
```
- `sessions` — the 7 sessions that earned it, newest first. Only returned to the owner.

---

### GET /badges/me
All of the caller's badges, private ones included, newest first.

**Auth required**: Yes (JWT cookie)

**Success Response** `200 OK`: Array of badge objects.

---

### GET /badges/user/:userId
Another player's badges, for their profile: **shared ones only** (without `sessions` or `seenAt`). Your own `userId` returns everything, like `/badges/me`.

**Auth required**: Yes (JWT cookie)

**Error Responses**:
- `400` — invalid user id

---

### POST /badges/:badgeId/seen
Record that the unlock pop-up was shown.

**Auth required**: Yes (JWT cookie, the badge's owner)

**Success Response** `201 Created`: The badge with `seenAt` set.

**Error Responses**:
- `404` — not found, or not your badge

---

### PATCH /badges/:badgeId/share
"Share am": make the badge visible on your public profile, or hide it again.

**Auth required**: Yes (JWT cookie, the badge's owner)

**Request Body**:
```json
{ "shared": true }
```

**Success Response** `200 OK`: The updated badge.

**Error Responses**:
- `404` — not found, or not your badge

---

## Captains

### GET /captains/:id
Get the captain for a team or set.

**Auth required**: Yes (JWT cookie)

**Path Parameters**:
- `id` — team ID or set ID

**Success Response** `200 OK`: Populated user object of the captain.

**Error Responses**:
- `404` — no captain found for this ID

---

## Wallet & Payments

**Currency units**: every amount in this API — request bodies, response bodies, and every money field on `Location`, `Session`, `SessionPayment`, `Tournament`, `TournamentPayment`, `Wallet`, `Transaction`, `LedgerEntry`, and `PlatformCommission` — is in **kobo** (naira × 100), matching Paystack's native unit exactly. The backend never converts to/from naira; it passes amounts straight through to Paystack unchanged. **The frontend is responsible for all naira↔kobo conversion** — divide by 100 to display, multiply by 100 before sending a naira value the user typed.

**Amounts sent to the API must be whole numbers of kobo** (e.g. `200000` for ₦2,000). Decimals (`2000.5`), strings (`"200000"`), zero and negatives are rejected with `400`. That applies to:
- wallet top-up (`POST /wallet/fund`), withdrawals, and admin wallet funding;
- pool checkout `amount`;
- pitch prices (`pricePerHour`, `paymentPerPersonMonthly`);
- the amount settings.

Sending naira by mistake (`2000` meaning ₦2,000) is read as **₦20**.

### What a player pays

Every session payment is three parts, all in kobo:

| Part | What it is | Goes to |
|---|---|---|
| `baseAmount` | the player's share of the pitch price | the pitch owner's wallet |
| `commissionAmount` | i-One's commission, a % of the share (default **15%**, `GET/PATCH /settings/commission`) | i-One's platform wallet |
| `processingFee` | covers the card processor's fee: **1.9% + ₦100** of the total, ₦100 waived under ₦2,500, capped at ₦2,000 (`GET/PATCH /settings/processing-fee`) | Paystack's actual fee is paid from it; the rest is i-One's |
| **`amount`** | **what the player is charged** = base + commission + processing fee | |

Example: a ₦2,000 share → ₦2,000 + ₦300 commission + ₦44.55 processing fee = **₦2,344.55**. Show the breakdown at checkout; `POST /wallet/session/:sessionId/pay` returns all four fields.

**Refunds return the share and the commission, never the processing fee** (Paystack doesn't return its fee either). For the example above, a refund is ₦2,300.00.

### Session Payment Flow (pooled — hourly sessions, `paymentMode: "POOL"`)

The owner's price is the **total** for the pitch (`Session.paymentTarget`). Members chip in any amount until it's covered — one player can pay it all, or everyone can pay an equal share, or anything in between.

Example: ₦20,000/hr, 1 hour, 10 players → `paymentTarget = 2000000`. `fairShare` suggests ₦2,000 each, but a player can pay ₦10,000 and the pool shows ₦10,000 remaining to everyone, live.

1. The session fills up → the pot opens (`paymentStatus: "PENDING"`). No per-player bills are created.
2. A member calls `POST /wallet/session/:sessionId/pay` with `{ "amount": <kobo> }`. The server atomically **reserves** that amount of the pot (so two players can't both pay the last ₦10k), creates a `SessionPayment` contribution row, and returns a Paystack checkout URL for `amount + commission`.
3. The reservation holds for 15 minutes. If Paystack never confirms payment, it's released back into the pot (checked against Paystack first — a payment that did go through is confirmed, not released).
4. `charge.success` webhook → the contribution is `PAID`, the owner's wallet is credited its `baseAmount`, commission is recorded, and everyone watching `GET /wallet/session/:sessionId/payment-stream` gets the new paid/remaining.
5. When paid ≥ target, the session's `paymentStatus` flips to `COMPLETED` and teams are allocated. Members who paid nothing are fine.

**Leaving a pool**: before the pot is full, the leaving player's contributions are refunded and `remaining` goes back up. Once the pot is full, a player can leave but gets **no refund** — their contribution stays in.

**Late payments**: if a payment lands after its reservation expired and the pot has since been covered (or the session was cancelled, or the payer has left), it's confirmed and then automatically refunded in full.

### Session Payment Flow (per-player — monthly sessions and sessions created before pooling, `paymentMode: "PER_PERSON"`)

1. A session fills up → server automatically creates a `PENDING` payment record for every member. Each record's `amount` (what's charged to the player) is the location's base price plus the current platform commission (see `GET /settings/commission`), added on top — `baseAmount` is the location's price, unchanged; `commissionAmount` is the platform's cut.
2. Each member calls `POST /wallet/session/:sessionId/pay` to get a Paystack checkout URL for `amount` (base + commission)
3. Member pays via Paystack
4. Paystack sends `charge.success` webhook → server confirms payment, credits the owner's wallet with `baseAmount` only, and posts i-One's side to the platform wallet: + commission, + processing fee collected, − Paystack's actual fee (`data.fees`). See `GET /admin/billing/platform`.
5. Once all members have paid, `canSessionStart()` returns `true`

**Rescheduling**: once payment has opened on a session (either mode), rescheduling to a different duration returns `409` — the payment terms are frozen. Cancel and create a new session instead.

### Refund Flow

Refunds happen via `POST /sessions/cancel/:sessionId` (owner/captain cancels — refunds every paid member) or `DELETE /sessions/leave/:sessionId` (a single paid member leaves before the session starts). Both only *request* a refund — Paystack refunds are asynchronous:

`PENDING/PAID` → refund requested → `REFUND_PENDING` → Paystack webhook confirms → `REFUNDED` (owner wallet debited `baseAmount`, session flips to `REFUNDED` once every payment on it clears) — or `REFUND_FAILED` / `REFUND_NEEDS_ATTENTION` if Paystack can't complete it (see Webhooks section).

- **Amount refunded:** `amount − processingFee` (the share + commission). The processing fee is never refunded.
- **Commission:** handed back out of i-One's platform wallet when the refund completes (`COMMISSION_REVERSAL`). The owner is only debited their `baseAmount`, since they were never credited the commission.

---

### GET /wallet/me
Get the authenticated owner's wallet.

**Auth required**: Yes (JWT cookie + `IsOwnerGuard`)

**Success Response** `200 OK`:
```json
{
  "_id": "...",
  "balance": 5000000,
  "currency": "NGN",
  "status": "ACTIVE"
}
```

---

### POST /wallet/fund
Initialize a Paystack payment so the owner can top up their own wallet. Returns a checkout URL. When the transfer clears, the `charge.success` webhook fires and the wallet is credited automatically.

**Auth required**: Yes (JWT cookie + `IsOwnerGuard`)

**Request Body**:
```json
{ "amount": 1000000 }
```
- `amount`: required, whole kobo, > 0 (₦10,000 above). Anything else returns `400`.

**Success Response** `200 OK`:
```json
{
  "authorizationUrl": "https://checkout.paystack.com/...",
  "reference": "FUND_<uuid>",
  "amount": 1000000
}
```

**Notes**:
- Redirect the owner to `authorizationUrl` to complete the payment (supports bank transfer, card, etc.)
- A `PENDING` transaction is created immediately; it becomes `SUCCESS` once the webhook confirms payment

**Error Responses**:
- `404` — wallet not found for this user

---

### GET /wallet/ledger
Get the paginated ledger entry history for the authenticated owner's wallet. Each entry is an immutable record of a balance movement (credit or debit).

**Auth required**: Yes (JWT cookie + `IsOwnerGuard`)

**Query Parameters**:
- `page` (number, default: 1)
- `limit` (number, default: 50)

**Success Response** `200 OK`:
```json
{
  "entries": [
    {
      "_id": "...",
      "walletId": "...",
      "transactionId": "...",
      "type": "CREDIT",
      "amount": 500000,
      "balanceAfter": 5500000,
      "reason": "SESSION_PAYMENT",
      "createdAt": "2026-07-07T14:00:00.000Z"
    }
  ],
  "pagination": { "page": 1, "limit": 50, "total": 120, "totalPages": 3 }
}
```

---

### GET /wallet/balance
Get the authenticated owner's current wallet balance.

**Auth required**: Yes (JWT cookie + `IsOwnerGuard`)

**Success Response** `200 OK`:
```json
{
  "balance": 5000000,
  "currency": "NGN"
}
```

---

### GET /wallet/transactions
Get paginated transaction history for the authenticated owner.

**Auth required**: Yes (JWT cookie + `IsOwnerGuard`)

**Query Parameters**:
- `page` (number, default: 1)
- `limit` (number, default: 50)

**Success Response** `200 OK`:
```json
{
  "transactions": [ ...transactionDocuments ],
  "pagination": { "page": 1, "limit": 50, "total": 200, "totalPages": 4 }
}
```

---

### GET /wallet/session/:sessionId/payment-status
Get payment status summary for all members in a session.

**Auth required**: Yes (JWT cookie). Only session members, the pitch owner, or `SUPER_ADMIN` — anyone else gets `403` (`404` for an unknown session).

**Path Parameters**:
- `sessionId` — session ID

**Success Response** `200 OK`:
```json
{
  "totalPayments": 10,
  "paidPayments": 7,
  "pendingPayments": 3,
  "allCompleted": false,
  "payments": [ ...sessionPaymentDocuments ]
}
```

For a **POOL** session, the counts are of contribution rows, `allCompleted` means the pot is full, and a `pool` block is included (same shape as the payment stream's snapshot):
```json
{
  "totalPayments": 3,
  "paidPayments": 2,
  "pendingPayments": 1,
  "allCompleted": false,
  "payments": [ ...sessionPaymentDocuments ],
  "pool": {
    "sessionId": "507f...",
    "target": 2000000,
    "paid": 1200000,
    "reserved": 200000,
    "remaining": 800000,
    "available": 600000,
    "fairShare": 100000,
    "minContribution": 50000,
    "fullyFunded": false,
    "contributors": [
      { "userId": "507f...", "name": "Ada", "amount": 1000000 },
      { "userId": "507f...", "name": "Tunde", "amount": 200000 }
    ]
  }
}
```

Pool fields (all **kobo**, base amounts before commission):
- `target` — the session total
- `paid` — sum of confirmed contributions (derived from the payment rows)
- `reserved` — held by checkouts in progress
- `remaining` — `target − paid`
- `available` — `remaining − reserved`, the most anyone can start paying right now
- `fairShare` — suggestion only: `remaining` split across members who haven't contributed yet
- `minContribution` — smallest allowed contribution, unless it exactly clears what's left
- `fullyFunded` — pot is covered

---

### GET /wallet/session/:sessionId/my-payment
Get the authenticated user's own payment record for a session.

**Auth required**: Yes (JWT cookie)

**Path Parameters**:
- `sessionId` — session ID

**Success Response** `200 OK`: Session payment document.

**Note**: in a POOL session a player can have several contribution rows (top-ups, expired checkouts); this returns one of them. Use the `pool.contributors` list from `payment-status` or the payment stream for a player's total.

**Error Responses**:
- `404` — no payment record found

---

### POST /wallet/session/:sessionId/pay
Initialize a Paystack checkout for the current user's session payment. Returns a URL to redirect the user to.

**Tapping twice, retries and second devices are safe.** A player has at most **one open checkout per session**. Calling this again while it's open returns **the same checkout** (same `authorizationUrl` and `reference`), and Paystack charges a reference only once. The app doesn't need to send any key; the server works it out from the session and the player.
- While the first call is still waiting on Paystack, a repeat gets **`409`** with `code: "CHECKOUT_IN_PROGRESS"`. Retry after about a second to get the checkout.
- An open checkout that hasn't been paid for **15 minutes** is treated as abandoned. The next call checks it with Paystack (a late payment on it still counts) and then starts a fresh checkout.
- Once it's paid, a repeat returns `{ "alreadyPaid": true, ... }` as before.
- If a player somehow pays **two** checkouts for the same thing (e.g. an abandoned page paid late, after a fresh one was issued), the extra charge is **refunded in full automatically**. It never counts as a payment and the owner is never credited for it.

**Auth required**: Yes (JWT cookie)

**Path Parameters**:
- `sessionId` — session ID

**Request Body** (POOL sessions — required):
```json
{ "amount": 1000000 }
```
- `amount`: whole number of **kobo**, base (commission is added on top). Must be ≥ `minContribution` and ≤ `available`, except that a smaller amount is allowed if it exactly clears what's left. Ignored for PER_PERSON sessions (their amount is fixed).

**Success Response — POOL** `201 Created`:
```json
{
  "authorizationUrl": "https://checkout.paystack.com/...",
  "accessCode": "0peioxfhpn...",
  "reference": "SESSION_507f..._USER_507f..._uuid",
  "amount": 1182467,
  "baseAmount": 1000000,
  "commissionAmount": 150000,
  "processingFee": 32467,
  "expiresAt": "2026-10-10T12:15:00.000Z"
}
```
- `amount` is what Paystack charges = `baseAmount` + `commissionAmount` + `processingFee` (see [What a player pays](#what-a-player-pays)); `baseAmount` is what counts toward the pot. The pot share is held until `expiresAt`.
- If the player already has an open checkout on this session, **that checkout is returned**, even if this call asks for a different `amount`. To pay a different amount, cancel it first with `DELETE /wallet/session/:sessionId/checkout`, then call this again. (Otherwise it expires on its own after 15 minutes, at `expiresAt`.) One open checkout per player is what stops a double charge.
- If the pot is already full, returns `{ "alreadyPaid": true, "status": "confirmed", "pool": { ... } }`.

**Error Responses — POOL**:
- `409` — amount is more than `available` right now; body includes the current `pool` so the app can update its numbers
- `409` with `code: "CHECKOUT_IN_PROGRESS"` — this player's checkout is still being prepared; retry shortly
- `400` — below `minContribution` (and not an exact clear), not a whole number, or payment isn't open yet (session not full)
- `403` — caller is not a member of the session

**Success Response** `201 Created`:
```json
{
  "authorizationUrl": "https://checkout.paystack.com/...",
  "reference": "SESSION_507f..._USER_507f..._uuid",
  "amount": 250000
}
```

**Note**: `amount` here is the base session price plus platform commission (see `GET /settings/commission`) — it's what the player actually pays, not the location's listed price. The owner is credited only the base amount once payment is confirmed.

**Notes**:
- Redirect the user to `authorizationUrl` to complete payment
- After payment, Paystack fires `POST /webhooks/paystack` and the server confirms payment automatically

**Error Responses**:
- `404` — no pending payment found for this user in this session (PER_PERSON)
- `409` with `code: "CHECKOUT_IN_PROGRESS"` — this player's checkout is still being prepared; retry shortly

---

### DELETE /wallet/session/:sessionId/checkout
Cancel the caller's open checkout on this session, typically to pay a **different amount** in a POOL session, or to get a fresh page.

Paystack is asked first. **If the page was already paid, that payment is confirmed instead** and nothing is cancelled. Otherwise:
- **POOL:** the hold on the pot is released at once (`reservation_released` on the payment stream). If the player pays the cancelled page later anyway, that payment is **refunded in full and never counts**, so they can't end up paying both.
- **PER_PERSON:** the next `POST /pay` gives a fresh page. Paying the old page later still pays the same session share. If both get paid, the extra charge is refunded automatically.

**Auth required**: Yes (JWT cookie)

**Success Response** `200 OK`, one of:
```json
{ "cancelled": true }
```
```json
{ "cancelled": false, "alreadyPaid": true, "status": "confirmed" }
```

**Error Responses**:
- `404` — the player has no open checkout on this session
- `409` with `code: "CHECKOUT_IN_PROGRESS"` — the checkout is still being prepared; retry shortly
- `503` — Paystack couldn't be reached to confirm the page wasn't paid; nothing was changed, try again

---

### GET /wallet/session/:sessionId/payment-stream
Server-Sent Events stream of a POOL session's live paid / remaining.

**Auth required**: Yes (JWT cookie). Session members, the pitch owner, or `SUPER_ADMIN`.

**Events** (each `data:` is JSON):
- On connect: `{ "type": "pool_snapshot", "snapshot": { ...pool }, "timestamp": ... }`
- On every change: `{ "type": "pool_update", "reason": "...", "snapshot": { ...pool }, "timestamp": ... }`. `reason` is one of `pool_opened`, `reserved`, `reservation_released`, `paid`, `refund_requested`, `member_left`, `recomputed`.
- Every 30s: `{ "type": "heartbeat", "timestamp": ... }`

`snapshot` has the same shape as `pool` in `GET /wallet/session/:sessionId/payment-status`. Every event carries the **full** state, never a delta — just render the latest snapshot. On reconnect, the first event is a fresh snapshot from the database, so nothing missed while disconnected matters.

**Error Responses**:
- `403` — not a member / owner / super admin
- `400` — the session isn't a POOL session
- `404` — session not found

---

### POST /wallet/bank-accounts
Add a bank account for withdrawals. Account is verified via Paystack before saving.

**Auth required**: Yes (JWT cookie + `IsOwnerGuard`)

**Request Body**:
```json
{
  "accountNumber": "0123456789",
  "bankCode": "044",
  "bankName": "Access Bank"
}
```

**Success Response** `201 Created`: Bank account document.

---

### GET /wallet/bank-accounts
Get all active bank accounts for the authenticated owner.

**Auth required**: Yes (JWT cookie + `IsOwnerGuard`)

**Success Response** `200 OK`: Array of bank account documents.

---

### PATCH /wallet/bank-accounts/:bankAccountId/default
Set a bank account as the default for withdrawals.

**Auth required**: Yes (JWT cookie + `IsOwnerGuard`)

**Path Parameters**:
- `bankAccountId` — bank account ID

**Success Response** `200 OK`: Updated bank account document.

---

### DELETE /wallet/bank-accounts/:bankAccountId
Soft-delete a bank account.

**Auth required**: Yes (JWT cookie + `IsOwnerGuard`)

**Path Parameters**:
- `bankAccountId` — bank account ID

**Success Response** `200 OK`: Deletion confirmation.

---

### POST /wallet/withdraw
Withdraw funds to a bank account.

**Auth required**: Yes (JWT cookie + `IsOwnerGuard`)

**Request Body**:
```json
{
  "amount": 1000000,
  "bankAccountId": "507f...",
  "reason": "Monthly payout"
}
```

**Field Notes**:
- `bankAccountId`: optional — if omitted, uses the default bank account
- Amount must be ≤ wallet balance

**Success Response** `201 Created**: Transfer initiation result from Paystack.

**Error Responses**:
- `400` — insufficient balance
- `404` — no default bank account found

---

## Banks

Reference list of supported banks, synced from Paystack via `npx ts-node -r tsconfig-paths/register scripts/seed-banks.ts`. Used to populate bank-selection dropdowns when adding a `POST /wallet/bank-accounts` entry.

### GET /banks
List all active banks (Nigeria, NGN by default).

**Auth required**: Yes (JWT cookie)

**Caching**: The result is cached **in-memory for 24 hours** per server instance — the first request after startup (or cache expiry) reads from MongoDB, every subsequent request across all users is served from memory with no DB hit.

**Success Response** `200 OK`:
```json
[
  {
    "_id": "...",
    "paystackId": 1,
    "name": "Access Bank",
    "slug": "access-bank",
    "code": "044",
    "longcode": "044150149",
    "gateway": "emandate",
    "payWithBank": false,
    "supportsTransfer": true,
    "availableForDirectDebit": true,
    "active": true,
    "country": "Nigeria",
    "currency": "NGN",
    "type": "nuban",
    "isDeleted": false
  }
]
```

---

## Settings

Platform-wide configuration — a singleton document, created on first read. Commission defaults to **15%**; the processing fee to **1.9% + ₦100** (₦100 waived under ₦2,500, capped at ₦2,000). Existing databases are moved to 15% by `npm run migrate:platform-wallets` only if no super admin has ever set the commission.

### GET /settings/commission
Get the current platform commission percentage.

**Auth required**: Yes (JWT cookie + `SUPER_ADMIN` role)

**Success Response** `200 OK`:
```json
{
  "commissionPercentage": 5,
  "commissionUpdatedBy": "507f...",
  "commissionUpdatedAt": "2026-07-16T10:00:00.000Z"
}
```

---

### PATCH /settings/commission
Update the platform commission percentage. Takes effect for payments created *after* this call — payments already in flight keep the rate they were created with (see `commissionPercentage` on `SessionPayment`).

**Auth required**: Yes (JWT cookie + `SUPER_ADMIN` role)

**Request Body**:
```json
{ "percentage": 5 }
```

**Field Notes**:
- `percentage`: number, `0`–`100`

**Success Response** `200 OK`: Updated settings document.

**Error Responses**:
- `400` — percentage outside 0–100

---

### GET /settings/min-contribution
Smallest contribution (kobo) a player can make into a POOL session. Super admin only.

**Success Response** `200 OK`:
```json
{ "minContributionAmount": 50000 }
```

Defaults to `50000` (₦500). A contribution smaller than this is still accepted if it exactly clears what's left in the pot.

### PATCH /settings/min-contribution
**Auth required**: Yes (JWT cookie + `SUPER_ADMIN` role)

**Request Body**:
```json
{ "amount": 50000 }
```
- `amount`: whole number of kobo, ≥ 0

### GET /settings/processing-fee
The processing fee players pay on top of price + commission. Super admin only.

**Success Response** `200 OK` (percent, then kobo):
```json
{ "percent": 1.9, "flat": 10000, "flatWaivedBelow": 250000, "cap": 200000 }
```

### PATCH /settings/processing-fee
Update any of the fields. Takes effect for payments created afterwards (each payment snapshots its fee).

**Auth required**: Yes (JWT cookie + `SUPER_ADMIN` role)

**Request Body** (all optional):
```json
{ "percent": 1.9, "flat": 10000, "flatWaivedBelow": 250000, "cap": 200000 }
```
- `percent`: 0–99. Set above Paystack's ≈1.5% on purpose — the difference is platform income.
- `flat`, `flatWaivedBelow`, `cap`: whole kobo, ≥ 0.

---

## Location Billing

Endpoints for location owners to view session payment history grouped by team and validate per-team payment completeness.

All endpoints under `/billing/location` require `IsOwnerGuard`.

---

### GET /billing/location/:locationId/transactions
Get paginated transaction history for a location, grouped by calendar date. Each entry represents one team (Set) within one session.

**Auth required**: Yes (JWT cookie + `IsOwnerGuard`)

**Path Parameters**:
- `locationId` — location ID

**Query Parameters**:
- `page` (number, default: 1)
- `limit` (number, default: 20)

**Success Response** `200 OK`:
```json
{
  "data": [
    {
      "date": "2026-03-20",
      "entries": [
        {
          "teamName": "Team 1",
          "sessionId": "507f...",
          "setId": "507f...",
          "sessionStartTime": "2026-03-20T17:00:00.000Z",
          "pricingOption": "hourly",
          "paymentAmount": 150000,
          "teamSize": 5,
          "membersPaid": 5,
          "totalPaid": 750000,
          "expectedTotal": 750000,
          "paymentStatus": "COMPLETE",
          "paidAt": "2026-03-20T17:05:00.000Z"
        },
        {
          "teamName": "Team 2",
          "sessionId": "507f...",
          "setId": "507f...",
          "sessionStartTime": "2026-03-20T17:00:00.000Z",
          "pricingOption": "hourly",
          "paymentAmount": 150000,
          "teamSize": 5,
          "membersPaid": 3,
          "totalPaid": 450000,
          "expectedTotal": 750000,
          "paymentStatus": "PARTIAL",
          "paidAt": "2026-03-20T17:10:00.000Z"
        }
      ]
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "totalPages": 3
  }
}
```

**Field Notes**:
- `paymentStatus`: `"COMPLETE"` (all team members paid) | `"PARTIAL"` (some paid) | `"UNPAID"` (none paid)
- `date` — ISO date string (`YYYY-MM-DD`), the **Lagos** calendar day of the latest payment in that group
- Only `PAID` payments are included — pending/failed records are excluded
- `paymentMode`: `"PER_PERSON"` | `"POOL"`
- **POOL sessions** (hourly, total price split between players) appear as **one entry per session**, not per team, since the total is owed by the session as a whole:
  - `teamName` is `"Whole session"`, `setId` is `null`
  - `teamSize` is the number of session members
  - `membersPaid` counts distinct players who contributed (a player who topped up is counted once)
  - `totalPaid` is the sum of all paid contributions
  - `expectedTotal` is the session's `paymentTarget`
  - `paymentStatus` is `"COMPLETE"` once `totalPaid >= expectedTotal`, otherwise `"PARTIAL"`
  - `paymentAmount` is `0` for these sessions

---

### GET /billing/location/:locationId/sessions/:sessionId/team-status
Validate payment completeness for every team in a single session. Shows each team's players, what was expected vs collected, and the shortfall.

**Auth required**: Yes (JWT cookie + `IsOwnerGuard`)

**Path Parameters**:
- `locationId` — location ID
- `sessionId` — session ID

**Success Response** `200 OK`:
```json
{
  "sessionId": "507f...",
  "sessionStartTime": "2026-03-20T17:00:00.000Z",
  "sessionStopTime": "2026-03-20T18:30:00.000Z",
  "paymentAmount": 150000,
  "pricingOption": "hourly",
  "sessionPaymentStatus": "PENDING",
  "grandExpected": 1500000,
  "grandPaid": 1050000,
  "shortfall": 450000,
  "allTeamsPaid": false,
  "teams": [
    {
      "setId": "507f...",
      "teamName": "Team 1",
      "totalPlayers": 5,
      "playersPaid": 5,
      "playersUnpaid": 0,
      "expectedTotal": 750000,
      "totalPaid": 750000,
      "shortfall": 0,
      "status": "COMPLETE",
      "playerDetails": [
        { "userId": "507f...", "status": "PAID", "amountPaid": 150000, "paidAt": "2026-03-20T17:05:00.000Z" }
      ]
    },
    {
      "setId": "507f...",
      "teamName": "Team 2",
      "totalPlayers": 5,
      "playersPaid": 3,
      "playersUnpaid": 2,
      "expectedTotal": 750000,
      "totalPaid": 450000,
      "shortfall": 300000,
      "status": "PARTIAL",
      "playerDetails": [
        { "userId": "507f...", "status": "PAID",     "amountPaid": 150000, "paidAt": "2026-03-20T17:08:00.000Z" },
        { "userId": "507f...", "status": "NOT_PAID", "amountPaid": 0,    "paidAt": null }
      ]
    }
  ]
}
```

**Field Notes**:
- `status` per team: `"COMPLETE"` | `"PARTIAL"` | `"UNPAID"`
- `playerDetails[].status`: `"PAID"` | `"PENDING"` | `"NOT_PAID"` (POOL sessions may also show `"EXPIRED"` for an abandoned checkout)
- `shortfall` — amount still outstanding (0 when complete)
- `allTeamsPaid` — `true` only when every team in the session has status `"COMPLETE"`
- `paymentMode`: `"PER_PERSON"` | `"POOL"`; `paymentTarget` is the session total for POOL, `null` otherwise

**POOL sessions** — the total is owed by the session, not per team:
- `grandExpected` = `paymentTarget`
- `grandPaid` = every paid contribution on the session, including from players no longer in a team (e.g. left after the pot was full)
- `shortfall` = `grandExpected − grandPaid`
- `allTeamsPaid` = pot is full
- Per team, `expectedTotal` and `shortfall` are `null`. `totalPaid` is what that team's players contributed. `status` is `"COMPLETE"` for every team once the pot is full, otherwise `"PARTIAL"` / `"UNPAID"` by whether the team's players have put anything in.
- `playerDetails[].amountPaid` sums all of a player's paid contributions

**Error Responses**:
- `404` — session not found
- `403` — session does not belong to this owner's location (checked against the location's owner, so this also applies before anyone has paid)

---

## Notifications

Real-time in-app notifications delivered over SSE. The server pushes events to the connected user — no polling needed.

**How it works:**
- The frontend opens `GET /notifications/stream` once on login and keeps it open
- When a relevant event occurs (e.g. a session is booked at the owner's location), the server pushes it down the open connection instantly
- Events are user-targeted — each user only receives their own notifications
- Built on Redis Pub/Sub so events are delivered correctly even when running multiple server instances
- Most events are also sent as an FCM push notification (if the target user has a registered device token via `PATCH /user/device-token`) — SSE for the live in-app feed, push for when the app isn't open. A push failure never affects SSE delivery or the action that triggered the notification.
- Some notification types (welcome, password reset, email verification, KYC submitted/approved/rejected, session created) are also sent by email — channel and template are decided per notification type internally, not per call site.

### GET /notifications/stream (SSE)
Open a persistent notification stream for the authenticated user.

**Auth required**: Yes (JWT cookie)

**Headers**: `Accept: text/event-stream`, `Cache-Control: no-cache`

**Events**:
```
// On connect
data: {"type":"connected","userId":"507f...","timestamp":1234567890}

// Session created at owner's location (sent to location owner)
data: {
  "targetUserId": "507f...",
  "type": "SESSION_CREATED",
  "title": "New Session Created",
  "body": "A session has been created at Lagos Sports Complex",
  "payload": { "sessionId": "507f...", "locationId": "507f..." },
  "timestamp": 1234567890
}

// Session configured at owner's location (sent to location owner)
data: {
  "targetUserId": "507f...",
  "type": "SESSION_CONFIGURED",
  "title": "Session Configured",
  "body": "A session at Lagos Sports Complex has been configured and is ready",
  "payload": { "sessionId": "507f...", "locationId": "507f..." },
  "timestamp": 1234567890
}

// Heartbeat (every 30s — keeps connection alive through proxies)
data: {"type":"heartbeat","timestamp":1234567890}
```

**Event Types**:
| Type | Trigger | Recipient |
|---|---|---|
| `SESSION_CREATED` | User calls `POST /sessions/start` at a location | Location owner |
| `SESSION_CONFIGURED` | Captain calls `POST /sessions/create/:sessionId` | Location owner |
| `SESSION_BROADCAST` | Captain/owner calls `POST /sessions/notify/:sessionId` | All session members |
| `ADMIN_BROADCAST` | Super admin calls `POST /notifications/broadcast` | Every user with a registered device token |
| `SESSION_REMINDER` | Automatic, 15 and 5 minutes before a session starts | Session members; plus the captain and pitch owner when it isn't fully paid |
| `REFEREE_INVITE` | Captain calls `POST /referees/:sessionId/invite`. `payload: { sessionId, refereeId }` | The invited user |
| `SESSION_VOTE_OPEN` | Player of the Session voting opens. `payload: { sessionId }`. Not delivered after voting closes | Every player eligible to vote |
| `SESSION_VOTE_RESULT` | Player of the Session result is counted. `payload: { sessionId }` | Every player eligible to vote |
| `BADGE_UNLOCKED` | A player unlocks a badge. `payload: { badgeId, badge, sessions, goals, assists }` | That player |
| `MATCH_RESULT_REVIEW` | A Referee-mode match ends (`PENDING_CONFIRMATION`). `payload: { matchId, sessionId }`. Not delivered after `reviewUntil` | Players allowed to confirm or dispute it |

**`SESSION_REMINDER`**: sent by a background job, so no endpoint triggers it. It goes out on this stream and as a phone push. Times in the text are Lagos time. Its `payload`:
```json
{
  "sessionId": "507f...",
  "minutesBefore": 15,
  "role": "member",
  "fullyPaid": false,
  "startTime": "2026-05-03T16:00:00.000Z"
}
```
- `minutesBefore`: `15` or `5`. If the server missed the 15-minute moment (e.g. it restarted), only the 5-minute one is sent. A session booked less than 15 minutes ahead gets a reminder with the real minutes left ("Kick-off in 12 min").
- `role`: `member` | `captain` | `owner`. A captain who is also playing gets two reminders: their player one and a captain one.
- `fullyPaid`: use it to choose the action button. `true` → "View game"; `false` → "Pay now" for members, "Manage game" (reschedule/cancel) for the captain and owner.
- The message depends on the situation:
  - **Fully paid or free:** members get "Kick-off in 14 min — Your game at Lekki Pitch starts at 5:00 PM — get ready!"
  - **Pool not covered:** members get "₦8,000 still needed for your 5:00 PM game… Pay now or it can't start."
  - **Per-player, not all paid:** players who owe get "You haven't paid…"; players who paid get "You're paid — waiting on 2 players…".
  - **Not full yet** (payment hasn't opened): members get "…still needs 3 more players before payment opens. Invite friends to join."
  - **Captain** (when not fully paid): "…Collect payment, reschedule or cancel." (or "Invite players, reschedule or cancel." when not full).
  - **Pitch owner:** only notified when the session isn't fully paid.
- A rescheduled session gets fresh reminders for its new time. Reminders for cancelled or moved sessions, and "please pay" reminders for sessions that have since been fully paid, are dropped before sending.

**Notes**:
- Reconnect automatically if the connection drops — browsers handle this natively with `EventSource`
- The heartbeat fires every 30 seconds to prevent proxy timeouts

---

### POST /notifications/broadcast
Send a free-text push notification to every user on the platform with a registered device token. Super admin only.

**Auth required**: Yes (JWT cookie + `SUPER_ADMIN` role)

**Request Body**:
```json
{
  "title": "New feature released",
  "body": "Check out the new pitch discovery map!"
}
```

**Success Response** `202 Accepted`:
```json
{ "message": "Broadcast started" }
```

**Notes**:
- Returns immediately — the actual sends happen in the background, in batches of 25, so the request doesn't stay open for however long a full platform-wide send takes.
- Push only, not email.
- If the server restarts mid-broadcast, that run is not resumed (no persistent queue backs this yet).

---

### POST /notifications/test-push
Send a push notification directly to a specific FCM device token. Super admin only. For testing the push pipeline against one device — does not look anything up in the database, so the token doesn't need to belong to a registered user.

**Auth required**: Yes (JWT cookie + `SUPER_ADMIN` role)

**Request Body**:
```json
{
  "fcmToken": "e3f8a1b2c4d5...",
  "title": "Test",
  "body": "Testing push notifications"
}
```

**Success Response** `200 OK`:
```json
{ "message": "Test push sent" }
```

**Notes**:
- Always returns `200` regardless of whether the push actually succeeded — delivery failures (e.g. an invalid/expired token) are caught internally and only logged server-side (`Notification sent successfully` / `Notification failed: ...`), never surfaced in the response. Check server logs to confirm a test actually landed.

---

### Notification delivery tracking (super admin)

Notifications sent through the **outbox** (currently `SESSION_REMINDER`, `REFEREE_INVITE`, `MATCH_RESULT_REVIEW`, `SESSION_VOTE_OPEN`, `SESSION_VOTE_RESULT` and `BADGE_UNLOCKED`) are stored as rows that record exactly what happened. Delivery runs in the background with retries: the request that triggers a notification never waits on FCM.

Each row has:
- `status`: `PENDING` → `SENDING` → one of:
  - `SENT`;
  - `FAILED`;
  - `SKIPPED` (no longer relevant or past its deadline, so deliberately not sent).
- `deliveredVia`: `["in_app","push"]` if the phone push was accepted by FCM, `["in_app"]` if not.
- `pushResult`: what happened, one of:

  | `pushResult` | Meaning |
  |---|---|
  | `PUSHED` | FCM accepted the push |
  | `NO_DEVICE` | the user has no device registered |
  | `INVALID_TOKEN` | the device token is dead; it's cleared from the user |
  | `PUSH_DISABLED` | Firebase isn't configured |
  | `RETRYABLE` | temporary FCM/Redis problem (the last try if `FAILED`) |
  | `PERMANENT` | FCM rejected it and retrying won't help |
  | `EXPIRED` / `OBSOLETE` | skipped |

- `attempts`, `lastError` (FCM's error code and message), `fcmMessageId`, `sentAt`.
- Retries: temporary failures are retried after 30s and then 2 min, and become `FAILED` once the third attempt fails. `SENT` rows are kept 30 days, `FAILED` rows 90 days.
- `SENT` means FCM accepted the push. FCM doesn't report whether the user saw it. The in-app stream only reaches users with the app open at that moment.

#### GET /admin/notifications/summary?hours=24
Counts for the period (default: last 24 hours).

```json
{
  "since": "2026-10-12T18:00:00.000Z",
  "total": 120,
  "byStatus": { "SENT": 115, "FAILED": 2, "SKIPPED": 3 },
  "sent": { "pushed": 98, "inAppOnlyNoDevice": 15, "inAppOnlyInvalidToken": 2 },
  "failed": { "pushDisabled": 0, "permanent": 1, "retriesExhausted": 1 }
}
```

#### GET /admin/notifications?status=FAILED&type=SESSION_REMINDER&userId=&page=1&limit=50
Notification rows, newest first, with their errors. All filters are optional. `limit` max is 200.

#### POST /admin/notifications/:id/retry
Puts a `FAILED` or `SKIPPED` notification back in the queue (attempts reset). Returns `404` if the row isn't `FAILED` or `SKIPPED`.

**Auth required** (all three): Yes (JWT cookie + `SUPER_ADMIN` role)

---

## Admin

### GET /wallet/user/:userId
Get wallet details for any user. Super admin only.

**Auth required**: Yes (JWT cookie + `SUPER_ADMIN` role)

**Path Parameters**:
- `userId` — user ID

**Success Response** `200 OK`: Wallet document.

---

### PATCH /location/:locationId/pricing-options
Update pricing options for a location. Owner only.

**Auth required**: Yes (JWT cookie + `IsOwnerGuard`)

**Path Parameters**:
- `locationId` — location ID

**Request Body**:
```json
{
  "tier": "paid",
  "pricingOption": "hourly",
  "pricePerHour": 2000000
}
```

**Other valid payloads**:
```json
{
  "tier": "paid",
  "pricingOption": "monthly",
  "paymentPerPersonMonthly": 2000000
}
```

```json
{
  "tier": "free"
}
```

**Field Notes**:
- `tier`: `"free"` | `"paid"` (required)
- If `tier` is `"paid"`, the owner must already have at least one active bank account on file (`POST /wallet/bank-accounts`) — switching to paid with no payout destination configured is rejected
- If `tier` is `"paid"`, `pricingOption` is required
- If `pricingOption` is `"hourly"`, `pricePerHour` (total for the pitch per hour, kobo) must be greater than `0`. Existing sessions keep the price they were configured with.
- If `pricingOption` is `"monthly"`, `paymentPerPersonMonthly` must be greater than `0`
- Setting `tier` to `"free"` clears `pricingOption`, `pricePerHour`, `paymentPerPersonHourly` (legacy), and `paymentPerPersonMonthly`

**Success Response** `200 OK`:
```json
{
  "message": "Location pricing options updated successfully",
  "location": { ...updatedLocationDocument }
}
```

**Error Responses**:
- `400` — invalid pricing payload for selected tier/pricing option, or switching to `"paid"` with no active bank account on file
- `403` — not the owner of this location
- `404` — location not found

---

### PATCH /location/:locationId/opening-hours
Update a location's opening and closing hours. Owner only. Both fields are required together — this isn't a partial update, to avoid ending up with a mismatched pair (e.g. a stale closing time that's now before the new opening time).

These hours are what `POST /sessions/start` and session creation check against (`validateSessionWithinOperatingHours` in `sessions.service.ts`) to reject session times outside them, so changing them takes effect on the next session booking, not retroactively on existing sessions.

**Auth required**: Yes (JWT cookie + `IsOwnerGuard`)

**Path Parameters**:
- `locationId` — location ID

**Request Body**:
```json
{ "openingHour": "08:00", "closingHour": "22:00" }
```

**Field Notes**:
- Both fields required, format `HH:mm` (24-hour)
- All times are **Lagos time** (WAT, UTC+1), whatever timezone the server runs in. `closingHour` earlier than `openingHour` means open overnight (e.g. `23:00`–`05:00`, and a game from 23:30 to 01:00 is fine). The same time for both (e.g. `00:00`–`00:00`) means open 24 hours.

**Success Response** `200 OK`:
```json
{
  "message": "Opening hours updated",
  "location": { "_id": "507f...", "name": "Arena Lagos", "openingHour": "08:00", "closingHour": "22:00", ... }
}
```

**Error Responses**:
- `400` — `closingHour` is not after `openingHour`
- `401` — authenticated owner does not own this location
- `403` — caller is not an owner at all
- `404` — location not found

---

### POST /admin/billing/fund-wallet
Manually credit a user's wallet. Super admin only.

**Auth required**: Yes (JWT cookie + `SUPER_ADMIN` role)

**Request Body**:
```json
{
  "userId": "507f...",
  "amount": 500000
}
```

**Success Response** `201 Created`:
```json
{
  "message": "Wallet funded successfully",
  "transaction": { ...transactionDocument }
}
```

---

### POST /admin/billing/sessions/:sessionId/recompute-pool
Rebuilds a POOL session's `amountPaid` / `amountReserved` counters from its payment rows (the source of truth), completes the pot if that shows it full, and broadcasts the result. Super admin only — for reconciliation if a drift warning shows up in the logs.

**Success Response** `201 Created`:
```json
{ "sessionId": "507f...", "amountPaid": 1200000, "amountReserved": 0 }
```

---

### GET /admin/billing/commission-summary
i-One's revenue, from the platform wallet's ledger. Super admin only.

**Auth required**: Yes (JWT cookie + `SUPER_ADMIN` role)

**Success Response** `200 OK` (kobo):
```json
{
  "platformBalance": 16249,
  "commission": { "earned": 60000, "reversed": 30000, "net": 30000 },
  "processingFees": { "collected": 8910, "paidToPaystack": 22661, "surplus": -13751 },
  "auditRecords": { "commissionRecords": 2, "grossCommission": 60000, "reversedCommission": 30000 }
}
```

**Notes**:
- `platformBalance` is all of i-One's money: `commission.net + processingFees.surplus`.
- `commission.reversed` is commission handed back on refunds.
- `processingFees.surplus` is fees collected minus what Paystack actually charged. It's usually positive (we charge 1.9%, Paystack ≈1.5%) and dips when foreign cards cost more. It also includes Paystack's fee on owner wallet funding, which payers aren't charged.
- `auditRecords` sums the per-payment `PlatformCommission` records, including any from before the platform wallet existed.

### GET /admin/billing/platform
The platform wallet plus what's owed to pitch owners. Super admin only.

**Success Response** `200 OK`: everything in `commission-summary`, plus:
```json
{ "owedToOwners": 200000, "ownerWallets": 1, "totalHeld": 216249 }
```
- `owedToOwners`: sum of all owner wallet balances.
- `totalHeld = owedToOwners + platformBalance`: the money that should be held for owners and i-One combined.

---

## Webhooks

### POST /webhooks/paystack
Receive and process events from Paystack. **This endpoint is called by Paystack, not by your frontend.**

**Auth required**: No (validated by `x-paystack-signature` header)

**Headers**:
- `x-paystack-signature` — HMAC SHA-512 signature from Paystack

**Handled Events**:
| Event | Action |
|---|---|
| `charge.success` (session) | metadata has `sessionId`+`userId` → confirms session payment, credits owner wallet with `baseAmount`, records commission (if any). POOL contributions are matched by `reference`; a contribution that would overfund the pot (or arrives for a cancelled session / a player who left) is confirmed then refunded in full |
| `charge.success` (tournament) | metadata has `type: "TOURNAMENT_REGISTRATION"` → credits the location owner's wallet and marks the team's registration as PAID |
| `charge.success` (wallet funding) | metadata has `type: "WALLET_FUNDING"` + `walletId` → credits the owner's wallet and marks the pending transaction as SUCCESS |
| `transfer.success` | Marks the withdrawal transaction as SUCCESS |
| `transfer.failed` | Refunds the debited wallet amount |
| `transfer.reversed` | Refunds the debited wallet amount |
| `refund.pending` / `refund.processing` | Logged only — the payment is already `REFUND_PENDING` from the initial refund request (`POST /sessions/cancel/:sessionId` or `DELETE /sessions/leave/:sessionId`) |
| `refund.processed` | Debits the owner's wallet by `baseAmount`, marks the `SessionPayment` as `REFUNDED`, and flips the session to `REFUNDED` once every paid member on it has cleared |
| `refund.failed` | Marks the payment `REFUND_FAILED` — needs manual follow-up/retry, no automatic retry |
| `refund.needs-attention` | Marks the payment `REFUND_NEEDS_ATTENTION` — Paystack couldn't determine the player's bank account from the original transaction. **Not currently automatable**: this app doesn't collect player bank details anywhere, so completing this requires an ops person to obtain them and call the retry-refund flow manually. |

**Idempotency**: Every webhook is stored in `WebhookEvent` before processing. A unique index on `eventId` means only one record ever exists per event. `eventId` is `data.reference` for charge/transfer events; refund events don't carry that field, so it's derived as `` `${event}_${data.transaction_reference}` `` instead.

- Duplicate delivery of an event that was **processed** → `{ "status": "duplicate" }`, nothing re-runs.
- If processing **throws**, the endpoint returns an error so Paystack redelivers, and the event stays `processed: false`. A redelivery more than 2 minutes after the last attempt reclaims and reprocesses it. This is safe because every step is idempotent: the atomic `PENDING → PAID` claim, the wallet credit's reference check, and the commission record's unique index.

**Success Response** `201 Created`:
```json
{ "status": "success" }
```

---

## Universal / App Links

Serves the platform link-verification files that let iOS/Android open the app directly (instead of a browser) when a user taps a shared session link (`https://<link-domain>/sessions/:sessionId`).

**Not under the `/i-one` prefix** — these are fetched directly by the OS (Apple's CDN / Android's Digital Asset Links verifier) at the domain root, so `app.setGlobalPrefix('i-one', { exclude: [...] })` excludes both paths in `main.ts`.

### GET /.well-known/apple-app-site-association
Apple App Site Association (AASA) file. Built from `APPLE_TEAM_ID` + `APPLE_BUNDLE_ID` env vars.

**Auth required**: No

**Response** `200 OK`:
```json
{
  "applinks": {
    "apps": [],
    "details": [
      { "appID": "<APPLE_TEAM_ID>.<APPLE_BUNDLE_ID>", "paths": ["/sessions/*"] }
    ]
  }
}
```

### GET /.well-known/assetlinks.json
Android Digital Asset Links file. Built from `ANDROID_PACKAGE_NAME` + `ANDROID_SHA256_CERT_FINGERPRINTS` (comma-separated) env vars.

**Auth required**: No

**Response** `200 OK`:
```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "<ANDROID_PACKAGE_NAME>",
      "sha256_cert_fingerprints": ["<ANDROID_SHA256_CERT_FINGERPRINTS>"]
    }
  }
]
```

**Note**: both endpoints serve empty/invalid identifiers until the four env vars above are set (see `.env`) and the chosen link domain's DNS points at this backend, and the mobile apps ship the matching Associated Domains entitlement (iOS) / intent filter (Android). Until then the files are reachable but won't verify.

---

## Error Handling

All error responses follow this format:

```json
{
  "statusCode": 404,
  "timestamp": "2025-01-01T00:00:00.000Z",
  "path": "/user/profile",
  "message": "User not found"
}
```
- `message` — always a single string (for validation errors, the first problem found).
- Extra fields appear only when an endpoint sends them:
  - `code` and `nextStep` — actionable guard errors (below);
  - `details` — machine-readable context, e.g. the current score on a `409` from a score change (see *Recording safely on a bad network*).

### Common Status Codes

| Code | Meaning |
|---|---|
| `400` | Bad request / validation failed |
| `401` | Not authenticated or invalid credentials |
| `403` | Authenticated but not authorized (wrong role/guard) |
| `404` | Resource not found |
| `409` | Conflict (duplicate email, nickname, etc.) |
| `429` | Too many SSE connections |
| `500` | Server error |

### Guard Errors

Some `403` responses are actionable state transitions for the frontend:

```json
{
  "message": "Email verification is required before continuing",
  "code": "EMAIL_VERIFICATION_REQUIRED",
  "nextStep": "VERIFY_EMAIL"
}
```

```json
{
  "message": "Verification documents are required before continuing",
  "code": "OWNER_VERIFICATION_REQUIRED",
  "nextStep": "SUBMIT_VERIFICATION"
}
```

---

## Types & Interfaces

### User
```typescript
interface User {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  nickname: string;
  avatar?: string;
  password: string;         // never returned in responses
  address: string;
  phoneNumber: string;
  position: 'DF' | 'MF' | 'ST';
  isOwner: boolean;
  role: 'USER' | 'SUPER_ADMIN';
  emailVerified: boolean;
  walletId?: string;        // set on verification approval
  currentSession?: string;
  height: number;
  dateOfBirth: Date;
  location: { type: 'Point'; coordinates: [number, number] };
  otp?: number;
  otpExpiration?: Date;
  otpVerified?: boolean;
  createdAt: string;
  updatedAt: string;
}
```

### Session
```typescript
interface Session {
  _id: string;
  location: string;           // Location ID
  captain: string;            // User ID
  members: string[];          // User IDs
  maxNumber: number;          // setNumber × playersPerTeam
  playersPerTeam: number;
  setNumber: number;
  minsPerSet: number;
  timeDuration: number;       // total minutes
  startTime: Date;
  stopTime: Date;
  winningDecider: 'penalties' | 'both_off';
  rotationFormat: 'winner_stays' | 'round_robin';
  matchType: 'FRIENDLY' | string;
  inProgress: boolean;
  finished: boolean;
  isFull: boolean;
  paymentRequired: boolean;
  paymentAmount?: number;
  paymentMode?: 'POOL' | 'PER_PERSON'; // POOL for hourly sessions (default going forward); PER_PERSON for monthly and pre-pooling sessions
  paymentTarget?: number;   // POOL: total the session pays (kobo, before commission)
  amountPaid?: number;      // POOL: confirmed contributions (kobo). Concurrency guard / cache — use the pool snapshot for display
  amountReserved?: number;  // POOL: held by in-progress checkouts (kobo)
  paymentStatus: 'NOT_INITIATED' | 'PENDING' | 'COMPLETED' | 'EXPIRED'; // PER_PERSON: flips PENDING -> COMPLETED once every member's SessionPayment confirms as PAID. POOL: PENDING once the session fills (pot open), COMPLETED once paid >= paymentTarget
  paymentDeadline?: Date;
  allPaymentsCompleted: boolean; // mirrors paymentStatus === 'COMPLETED'
  status: 'OPEN' | 'CANCELLED' | 'COMPLETED' | 'REFUNDED'; // lifecycle status, layered on top of finished/paymentStatus/isFull above — see POST /sessions/cancel. Absent on sessions created before this field existed until the backfill migration runs.
  allRefunded: boolean;        // true once every paid member's refund has been confirmed by Paystack
  createdAt: string;
  updatedAt: string;
}
```

### Location
```typescript
interface Location {
  _id: string;
  name: string;
  address: string;
  pitchPhoto?: string;
  location: { type: 'Point'; coordinates: [number, number] };
  friendly: boolean;
  tournament: boolean;
  tournamentFee?: number;
  owner?: string;                   // User ID
  tier: 'free' | 'paid';
  pricingOption?: 'hourly' | 'monthly';
  pricePerHour?: number;            // total for the pitch per hour (kobo), set when pricingOption === 'hourly'
  paymentPerPersonHourly?: number;  // legacy per-player hourly price — no longer set
  paymentPerPersonMonthly?: number; // set when pricingOption === 'monthly'
  openingHour?: string;             // HH:mm Lagos time, e.g. "08:00"
  closingHour?: string;             // HH:mm Lagos time, e.g. "22:00". Earlier than openingHour = overnight; equal = 24 hours
  createdAt: string;
  updatedAt: string;
}
```

### Verification
```typescript
interface Verification {
  _id: string;
  userId: string;
  idType: 'BVN' | 'NIN' | 'DRIVERS_LICENSE' | 'PASSPORT';
  idNumber: string;
  address: string;
  frontUrl: string;
  backUrl: string;
  locationPictures: string[];
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
}
```

### SessionPayment
```typescript
interface SessionPayment {
  _id: string;
  sessionId: string;
  userId: string;
  locationId: string;
  ownerId: string;
  amount: number;              // what the player is charged: baseAmount + commissionAmount
  baseAmount?: number;         // what the owner is credited (location's listed price). Absent on payments created before commission existed — treat as equal to `amount` (no commission) in that case.
  commissionAmount?: number;   // platform's cut, added on top of baseAmount. Never credited to the owner.
  commissionPercentage?: number; // commission rate snapshotted at the time this payment was created
  processingFee?: number;      // kobo, paid on top to cover Paystack's fee; never refunded. amount = baseAmount + commissionAmount + processingFee. Absent on older payments (= 0).
  paystackFee?: number;        // kobo, what Paystack actually charged (data.fees), recorded on confirmation
  status: 'PENDING' | 'PAID' | 'FAILED' | 'REFUND_PENDING' | 'REFUND_NEEDS_ATTENTION' | 'REFUND_FAILED' | 'REFUNDED' | 'EXPIRED'; // EXPIRED: POOL checkout reservation that timed out unpaid
  paymentReference: string;
  previousReferences?: string[]; // references superseded by a checkout retry — verified alongside `paymentReference` so a payment completed on an old, already-superseded checkout tab still gets caught
  transactionId?: string;
  paidAt?: Date;
  refundedAt?: Date;   // set only once refund.processed confirms the refund — absence means "never refunded"
  refundReference?: string; // Paystack's refund id, used to correlate incoming refund.* webhooks
  expiresAt?: Date;
  metadata?: {
    pricingOption?: 'hourly' | 'monthly'; // used for recurring payment checks
    paymentMode?: 'POOL';                 // set on POOL contribution rows (one row per contribution; a player may have several)
    [key: string]: any;
  };
  createdAt: string;
  updatedAt: string;
}
```

**Status lifecycle**: `PENDING` → `PAID` → (on refund request) `REFUND_PENDING` → (Paystack confirms) `REFUNDED`, or `REFUND_FAILED` / `REFUND_NEEDS_ATTENTION` if Paystack can't complete it. See Webhooks section.

### Set (Team)
```typescript
interface Set {
  _id: string;
  session: string;   // Session ID
  name: string;      // e.g. "Team 1", "Team 2"
  players: string[]; // User IDs
  createdAt: string;
  updatedAt: string;
}
```

### Wallet
```typescript
interface Wallet {
  _id: string;
  userId: string;
  balance: number;
  status: 'ACTIVE' | 'SUSPENDED' | 'CLOSED';
  currency: string;           // 'NGN'
  createdAt: string;
  updatedAt: string;
}
```

### Transaction
```typescript
interface Transaction {
  _id: string;
  walletId: string;
  userId: string;
  type: 'CREDIT' | 'DEBIT';
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'REVERSED';
  source: 'SESSION_PAYMENT' | 'TOURNAMENT_REGISTRATION' | 'WALLET_FUNDING' | 'ADMIN_FUNDING' | 'WITHDRAWAL' | 'TRANSFER' | 'REFUND';
  reference: string;
  paystackReference?: string;
  description: string;
  sessionId?: string;
  createdAt: string;
  updatedAt: string;
}
```

### LedgerEntry
Immutable append-only record of every balance movement. The wallet `balance` field is a cached projection of the ledger.
```typescript
interface LedgerEntry {
  _id: string;
  walletId: string;
  transactionId: string;
  type: 'CREDIT' | 'DEBIT';
  amount: number;
  balanceAfter: number;  // wallet balance immediately after this entry
  reason: string;        // source label, e.g. "SESSION_PAYMENT"
  createdAt: string;
}
```

### BankAccount
```typescript
interface BankAccount {
  _id: string;
  userId: string;
  accountNumber: string;
  bankCode: string;
  bankName: string;
  accountName: string;
  paystackRecipientCode: string;
  isDefault: boolean;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
}
```
