# I-One API Documentation

## Table of Contents
1. [Base URL & Authentication](#base-url--authentication)
2. [Health Check](#health-check)
3. [Authentication](#authentication)
4. [Users](#users)
5. [Email Verification](#email-verification)
6. [Verification (KYC)](#verification-kyc)
7. [Locations](#locations)
8. [Owner Dashboard](#owner-dashboard) — includes `/revenue` and `/users-chart`
9. [Sessions](#sessions)
10. [Sets](#sets)
11. [Matches](#matches)
12. [Tournaments](#tournaments)
13. [Stats](#stats)
14. [Captains](#captains)
15. [Wallet & Payments](#wallet--payments) — includes refund flow
16. [Banks](#banks)
17. [Settings](#settings) — platform commission rate
18. [Location Billing](#location-billing) — owner transaction history & team payment validator
19. [Notifications](#notifications)
20. [Admin](#admin) — includes commission summary
21. [Webhooks](#webhooks) — includes refund.* events
22. [Error Handling](#error-handling)
23. [Types & Interfaces](#types--interfaces)

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

## Health Check

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

### POST /verification/submit
Submit identity verification documents. Accepts multipart form data.

**Auth required**: Yes (JWT cookie)

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
  "wallet": { "_id": "...", "balance": 0, "ledgerBalance": 0, "currency": "NGN", "status": "ACTIVE" }
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
  "paymentPerPersonHourly": 150000,
  "paymentPerPersonMonthly": 2000000,
  "openingHour": "08:00",
  "closingHour": "22:00"
}
```

**Field Notes**:
- `tier`: `"free"` | `"paid"` (required)
- `pricingOption`: `"hourly"` | `"monthly"` — required when `tier` is `"paid"`
- `paymentPerPersonHourly`: amount per player per session, in **kobo** — required when `pricingOption` is `"hourly"` (e.g. `150000` = ₦1,500)
- `paymentPerPersonMonthly`: amount per player per month, in **kobo** — required when `pricingOption` is `"monthly"`
- `openingHour` / `closingHour`: operating hours in `HH:mm` 24-hour format (e.g. `"08:00"`, `"22:00"`). Sessions cannot be booked outside these hours.
- Sessions that span midnight are rejected

**Success Response** `201 Created`: Full location document.

**Error Responses**:
- `409` — a location already exists at those coordinates

---

### POST /location/pitch/:locationId
Upload or replace a pitch photo for a location.

**Auth required**: Yes (JWT cookie + `IsOwnerGuard`)

**Content-Type**: `multipart/form-data`

**Path Parameters**:
- `locationId` — location ID

**Form Data**:
- `file` — image file

**Success Response** `200 OK`:
```json
{ "pitchPhoto": "https://s3.amazonaws.com/pitches/123.jpg" }
```

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

**Success Response** `200 OK`: Array of match documents for that location.

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
- Periods: `this_week` starts Sunday 00:00, `this_month` starts the 1st, `this_year` starts Jan 1st

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
- `date` *(required)* — date in `YYYY-MM-DD` format (e.g. `2026-04-08`)

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
  "winningDecider": "PENALTY"
}
```

**Notes**:
- `maxNumber` is computed as `setNumber × playersPerTeam`
- Returns `409` if the time slot conflicts with another session at the same location
- Returns `400` if `startTime`/`stopTime` falls outside the location's `openingHour`–`closingHour` window
- Returns `400` if the session spans midnight
- `paymentRequired` and `paymentAmount` are automatically derived from the location's `tier` and `pricingOption` — no need to pass them manually
- For `hourly` pricing, `timeDuration` must be in full-hour blocks only (`60`, `120`, `180`, ...)
- Hourly charge per player is computed as: `paymentPerPersonHourly × (timeDuration / 60)`

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
- If this join fills the session (`members.length === maxNumber`) **and** `paymentRequired` is true, payment records are automatically initialized for all members who still owe payment
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
| `NOT_REQUIRED` | Session is free — no payment needed |

---

### GET /sessions/members/:sessionId
Get the member list for a session (nickname only).

**Auth required**: Yes (JWT cookie)

**Success Response** `200 OK`: Session with members array.

---

### DELETE /sessions/leave/:sessionId
Leave a session. If you've already paid for this session (and it hasn't started yet), a Paystack refund is requested automatically before you're removed — you can't leave with an outstanding paid-and-not-refunded session. If the refund can't even be requested (Paystack call fails), the leave is blocked entirely so you don't lose your spot and your money at the same time.

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
- `409` — overlaps with another session at the same location
- `400` — new time falls outside the location's operating hours or spans midnight

---

### PATCH /sessions/matchtype
Update match type for all sessions. Restricted to super-admins.

**Auth required**: Yes (JWT cookie)

**Role required**: `SUPER_ADMIN` — any other role receives `403`.

**Success Response** `200 OK`: MongoDB update result.

---

## Sets

### POST /sets/create/:sessionId
Create team sets for a session. The number of sets equals the session's `setNumber`. Team names are auto-assigned.

**Auth required**: Yes (JWT cookie)

**Path Parameters**:
- `sessionId` — session ID

**Success Response** `201 Created**: Array of created set documents.

---

### GET /sets/:sessionId
Get all sets for a session.

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

### POST /matches/matchup/:sessionId
Generate match pairings for a session. If the session requires payment, all members must have paid before matchups can be created.

**Auth required**: Yes (JWT cookie)

**Success Response** `201 Created`: Array of created match documents.

**Error Responses**:
- `402 Payment Required` — session requires payment and not all members have paid
- `400 Bad Request` — teams already matched, or odd number of sets

---

### GET /matches/matchups/:sessionId
View all matchups for a session.

**Auth required**: Yes (JWT cookie)

**Success Response** `200 OK`: Array of match documents.

---

### POST /matches/start/:matchId
Mark a match as started. Only the **owner of the location** hosting the match's session may call this.

**Auth required**: Yes (JWT cookie, location owner only)

**Success Response** `200 OK`: Updated match document.

**Error Responses**:
- `403` — caller is not the owner of the location hosting this match
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
  "isStarted": true,
  "matchType": "friendly",
  "goalScorers": [
    { "player": { "_id": "507f...", "firstName": "John", "nickname": "johndoe" }, "team": "teamOne" },
    { "player": { "_id": "507f...", "firstName": "Jane", "nickname": "janesmith" }, "team": "teamTwo" }
  ]
}
```

**Error Responses**:
- `404` — match not found

---

### POST /matches/goal-scorer/:matchId
Record a goal scorer for a match. Can be called multiple times (one call per goal). Only the **owner of the location** hosting the match's session may call this.

**Auth required**: Yes (JWT cookie, location owner only)

**Request Body**:
```json
{
  "playerId": "507f1f77bcf86cd799439011",
  "team": "teamOne"
}
```

**Field Notes**:
- `playerId`: MongoDB ObjectId of the player who scored
- `team`: `"teamOne"` or `"teamTwo"` — the team the scorer belongs to

**Success Response** `200 OK`: Updated match document with full population (same structure as `GET /matches/details/:matchId`).

**Error Responses**:
- `403` — caller is not the owner of the location hosting this match
- `400` — match has not started yet
- `404` — match not found

---

### POST /matches/end/:matchId
Mark a match as ended. Only the **owner of the location** hosting the match's session may call this.

**Auth required**: Yes (JWT cookie, location owner only)

**Success Response** `200 OK`: Finalized match document.

**Error Responses**:
- `403` — caller is not the owner of the location hosting this match
- `404` — match or session not found

---

### PUT /matches/increment-score/:matchId
Increment the score for a team. Only the **owner of the location** hosting the match's session may call this.

**Auth required**: Yes (JWT cookie, location owner only)

**Query Parameters**:
- `team`: `"teamOne"` | `"teamTwo"`

**Example**: `PUT /matches/increment-score/507f...?team=teamOne`

**Success Response** `200 OK`: Updated match document with new scores.

**Error Responses**:
- `403` — caller is not the owner of the location hosting this match
- `404` — match or session not found

---

### PUT /matches/decrement-score/:matchId
Decrement the score for a team. Only the **owner of the location** hosting the match's session may call this.

**Auth required**: Yes (JWT cookie, location owner only)

**Query Parameters**:
- `team`: `"teamOne"` | `"teamTwo"`

**Success Response** `200 OK`: Updated match document.

**Error Responses**:
- `403` — caller is not the owner of the location hosting this match
- `404` — match or session not found

---

### GET /matches/stream/:matchId (SSE)
Real-time score stream for a single match.

**Auth required**: Yes (JWT cookie)

**Headers**: `Accept: text/event-stream`, `Cache-Control: no-cache`

**Events**:
```
// On connect
data: {"type":"connected","message":"Connection established","matchId":"...","userId":"...","timestamp":1234567890}

// Score update (from increment/decrement)
data: {"matchId":"...","sessionId":"...","teamOne":{"id":"...","name":"Team 1"},"teamTwo":{"id":"...","name":"Team 2"},"teamOneScore":3,"teamTwoScore":1}

// Score update with goal scorer (from POST /matches/goal-scorer/:matchId)
data: {"matchId":"...","sessionId":"...","teamOne":{"id":"...","name":"Team 1"},"teamTwo":{"id":"...","name":"Team 2"},"teamOneScore":3,"teamTwoScore":1,"latestScorer":{"player":"507f...","team":"teamOne"}}

// Heartbeat (every 30s)
data: {"type":"heartbeat","timestamp":1234567890}
```

**Error Responses**:
- `429` — too many connections from this user

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

### POST /tournaments/:id/team
Create a team and register it to the tournament in one step. Only valid during `registration` status. **Captains register their own team** — `captainId` must match the authenticated user.

**Auth required**: Yes (JWT cookie, captain only — `captainId` must equal the calling user's ID)

**Request Body**:
```json
{
  "teamName": "Team Alpha",
  "logo": "https://...",
  "captainId": "507f...",
  "playerIds": ["507f...", "507f..."]
}
```

**Field Notes**:
- `captainId` is automatically added to `playerIds`
- `logo` is optional

**Error Responses**:
- `403` — `captainId` does not match the authenticated user
- `400` — tournament full or not in registration phase
- `404` — tournament or captain not found

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

### GET /stats/:userId
Get overall stats for any user — public profile lookup, not scoped to the caller.

**Auth required**: Yes (JWT cookie — just needs to be logged in, viewing someone else's stats is allowed)

**Path Parameters**:
- `userId` — the user whose stats to fetch

**Success Response** `200 OK`: Aggregated stats document.

---

### GET /stats/season
Get the authenticated user's own stats for a specific season range.

**Auth required**: Yes (JWT cookie)

**Query Parameters**:
- `seasonStart` (number, required) — e.g. `202401`
- `seasonEnd` (number, required) — e.g. `202412`

**Success Response** `200 OK`: Stats document for that period.

---

**No self-edit endpoint on purpose.** There is deliberately no `PATCH /stats/update` (or equivalent) here — stats are never player-editable. They're written by `initializeStat` on signup (zeroed) and, once wired up, by match-end aggregation off owner/official-recorded goal-scorer data (see `POST /matches/goal-scorer/:matchId`) — not by a player calling an endpoint about themselves.

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

### Session Payment Flow

1. A session fills up → server automatically creates a `PENDING` payment record for every member. Each record's `amount` (what's charged to the player) is the location's base price plus the current platform commission (see `GET /settings/commission`), added on top — `baseAmount` is the location's price, unchanged; `commissionAmount` is the platform's cut.
2. Each member calls `POST /wallet/session/:sessionId/pay` to get a Paystack checkout URL for `amount` (base + commission)
3. Member pays via Paystack
4. Paystack sends `charge.success` webhook → server confirms payment, credits the owner's wallet with `baseAmount` only (never the commission), and records the commission separately for revenue reporting (see `GET /admin/billing/commission-summary`)
5. Once all members have paid, `canSessionStart()` returns `true`

### Refund Flow

Refunds happen via `POST /sessions/cancel/:sessionId` (owner/captain cancels — refunds every paid member) or `DELETE /sessions/leave/:sessionId` (a single paid member leaves before the session starts). Both only *request* a refund — Paystack refunds are asynchronous:

`PENDING/PAID` → refund requested → `REFUND_PENDING` → Paystack webhook confirms → `REFUNDED` (owner wallet debited `baseAmount`, session flips to `REFUNDED` once every payment on it clears) — or `REFUND_FAILED` / `REFUND_NEEDS_ATTENTION` if Paystack can't complete it (see Webhooks section). A refund never claws back the commission from the owner, since the owner was never credited it in the first place.

---

### GET /wallet/me
Get the authenticated owner's wallet.

**Auth required**: Yes (JWT cookie + `IsOwnerGuard`)

**Success Response** `200 OK`:
```json
{
  "_id": "...",
  "balance": 5000000,
  "ledgerBalance": 5000000,
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
  "ledgerBalance": 5000000,
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

**Auth required**: Yes (JWT cookie)

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

---

### GET /wallet/session/:sessionId/my-payment
Get the authenticated user's own payment record for a session.

**Auth required**: Yes (JWT cookie)

**Path Parameters**:
- `sessionId` — session ID

**Success Response** `200 OK`: Session payment document.

**Error Responses**:
- `404` — no payment record found

---

### POST /wallet/session/:sessionId/pay
Initialize a Paystack checkout for the current user's session payment. Returns a URL to redirect the user to.

**Auth required**: Yes (JWT cookie)

**Path Parameters**:
- `sessionId` — session ID

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
- `404` — no pending payment found for this user in this session

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

Platform-wide configuration. Currently just the commission rate — a singleton document, created on first read with `commissionPercentage: 0` (no commission charged until a super admin explicitly sets it).

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
- `date` — ISO date string (`YYYY-MM-DD`) derived from the latest payment timestamp in that group
- Only `PAID` payments are included — pending/failed records are excluded

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
- `playerDetails[].status`: `"PAID"` | `"PENDING"` | `"NOT_PAID"`
- `shortfall` — amount still outstanding (0 when complete)
- `allTeamsPaid` — `true` only when every team in the session has status `"COMPLETE"`

**Error Responses**:
- `404` — session not found
- `403` — session does not belong to this owner's location

---

## Notifications

Real-time in-app notifications delivered over SSE. The server pushes events to the connected user — no polling needed.

**How it works:**
- The frontend opens `GET /notifications/stream` once on login and keeps it open
- When a relevant event occurs (e.g. a session is booked at the owner's location), the server pushes it down the open connection instantly
- Events are user-targeted — each user only receives their own notifications
- Built on Redis Pub/Sub so events are delivered correctly even when running multiple server instances

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

**Notes**:
- Reconnect automatically if the connection drops — browsers handle this natively with `EventSource`
- The heartbeat fires every 30 seconds to prevent proxy timeouts

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
  "paymentPerPersonHourly": 150000
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
- If `tier` is `"paid"`, `pricingOption` is required
- If `pricingOption` is `"hourly"`, `paymentPerPersonHourly` must be greater than `0`
- If `pricingOption` is `"monthly"`, `paymentPerPersonMonthly` must be greater than `0`
- Setting `tier` to `"free"` clears `pricingOption`, `paymentPerPersonHourly`, and `paymentPerPersonMonthly`

**Success Response** `200 OK`:
```json
{
  "message": "Location pricing options updated successfully",
  "location": { ...updatedLocationDocument }
}
```

**Error Responses**:
- `400` — invalid pricing payload for selected tier/pricing option
- `403` — not the owner of this location
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

### GET /admin/billing/commission-summary
All-time platform revenue from commission. Super admin only.

**Auth required**: Yes (JWT cookie + `SUPER_ADMIN` role)

**Success Response** `200 OK`:
```json
{
  "totalCommission": 4500000,
  "count": 120
}
```

**Notes**:
- Sums the `PlatformCommission` audit collection directly — a payment's commission stays on record even if that payment is later refunded (refunds don't reverse the commission entry).

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
| `charge.success` (session) | metadata has `sessionId`+`userId` → confirms session payment, credits owner wallet with `baseAmount`, records commission (if any) |
| `charge.success` (tournament) | metadata has `type: "TOURNAMENT_REGISTRATION"` → credits the location owner's wallet and marks the team's registration as PAID |
| `charge.success` (wallet funding) | metadata has `type: "WALLET_FUNDING"` + `walletId` → credits the owner's wallet and marks the pending transaction as SUCCESS |
| `transfer.success` | Marks the withdrawal transaction as SUCCESS |
| `transfer.failed` | Refunds the debited wallet amount |
| `transfer.reversed` | Refunds the debited wallet amount |
| `refund.pending` / `refund.processing` | Logged only — the payment is already `REFUND_PENDING` from the initial refund request (`POST /sessions/cancel/:sessionId` or `DELETE /sessions/leave/:sessionId`) |
| `refund.processed` | Debits the owner's wallet by `baseAmount`, marks the `SessionPayment` as `REFUNDED`, and flips the session to `REFUNDED` once every paid member on it has cleared |
| `refund.failed` | Marks the payment `REFUND_FAILED` — needs manual follow-up/retry, no automatic retry |
| `refund.needs-attention` | Marks the payment `REFUND_NEEDS_ATTENTION` — Paystack couldn't determine the player's bank account from the original transaction. **Not currently automatable**: this app doesn't collect player bank details anywhere, so completing this requires an ops person to obtain them and call the retry-refund flow manually. |

**Idempotency**: Every webhook is stored in `WebhookEvent` before processing. A unique index on `eventId` means duplicate deliveries of the same event are silently ignored — no double-credits. `eventId` is `data.reference` for charge/transfer events; refund events don't carry that field, so it's derived as `` `${event}_${data.transaction_reference}` `` instead.

**Known limitation**: the dedupe record is written *before* processing, so if processing throws partway through, Paystack's retries of that same event will be treated as duplicates and silently dropped rather than retried. Not specific to refunds — applies to all webhook types.

**Success Response** `201 Created`:
```json
{ "status": "success" }
```

---

## Error Handling

All error responses follow this format:

```json
{
  "statusCode": 404,
  "message": "User not found",
  "error": "Not Found",
  "timestamp": "2025-01-01T00:00:00.000Z",
  "path": "/user/profile"
}
```

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
  winningDecider: 'PENALTY' | string;
  matchType: 'FRIENDLY' | string;
  inProgress: boolean;
  finished: boolean;
  isFull: boolean;
  paymentRequired: boolean;
  paymentAmount?: number;
  paymentStatus: 'NOT_INITIATED' | 'PENDING' | 'COMPLETED' | 'EXPIRED';
  paymentDeadline?: Date;
  allPaymentsCompleted: boolean;
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
  paymentPerPersonHourly?: number;  // set when pricingOption === 'hourly'
  paymentPerPersonMonthly?: number; // set when pricingOption === 'monthly'
  openingHour?: string;             // HH:mm, e.g. "08:00"
  closingHour?: string;             // HH:mm, e.g. "22:00"
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
  status: 'PENDING' | 'PAID' | 'FAILED' | 'REFUND_PENDING' | 'REFUND_NEEDS_ATTENTION' | 'REFUND_FAILED' | 'REFUNDED';
  paymentReference: string;
  transactionId?: string;
  paidAt?: Date;
  refundedAt?: Date;   // set only once refund.processed confirms the refund — absence means "never refunded"
  refundReference?: string; // Paystack's refund id, used to correlate incoming refund.* webhooks
  expiresAt?: Date;
  metadata?: {
    pricingOption?: 'hourly' | 'monthly'; // used for recurring payment checks
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
  ledgerBalance: number;
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
