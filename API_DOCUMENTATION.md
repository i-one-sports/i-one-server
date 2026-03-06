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
15. [Wallet & Payments](#wallet--payments)
16. [Admin](#admin)
17. [Webhooks](#webhooks)
18. [Error Handling](#error-handling)
19. [Types & Interfaces](#types--interfaces)

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
Authenticate a user. Sets an HTTP-only JWT cookie on success.

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

Owner accounts must submit identity verification documents before they can start sessions. The admin reviews and approves or rejects submissions.

**Flow**:
1. Owner submits documents → status: `PENDING`
2. Super admin approves → status: `APPROVED`, wallet + DVA created
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
Approve a verification submission. Creates a wallet and Paystack Dedicated Virtual Account (DVA) for the user.

**Auth required**: Yes (JWT cookie + `SUPER_ADMIN` role)

**Path Parameters**:
- `id` — verification document ID

**Success Response** `200 OK`:
```json
{
  "message": "Verification approved and wallet created successfully",
  "verification": { ...verificationDocument, "status": "APPROVED" },
  "wallet": { "_id": "...", "balance": 0, "currency": "NGN" },
  "dva": {
    "accountNumber": "1234567890",
    "bankName": "Titan-Paystack",
    "accountName": "John Doe"
  }
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
  "tournamentFee": 5000
}
```

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
  "this_week":  { "total": 50000,  "count": 3  },
  "this_month": { "total": 200000, "count": 12 },
  "this_year":  { "total": 950000, "count": 58 }
}
```

**Field Notes**:
- `total` — sum of paid session payment amounts for the period (in kobo/smallest currency unit)
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
Start a new session at a location. The calling user becomes the captain. Requires the user's verification to be `APPROVED` or `PENDING`.

**Auth required**: Yes (JWT cookie)

**Request Body**:
```json
{ "locationId": "507f1f77bcf86cd799439013" }
```

**Success Response** `201 Created`: The created session document.

**Error Responses**:
- `403` — account not verified (no KYC doc or status is `REJECTED`)
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
  "timeDuration": 90,
  "minsPerSet": 30,
  "startTime": "2025-11-10T14:00:00.000Z",
  "winningDecider": "PENALTY"
}
```

**Notes**:
- `maxNumber` is computed as `setNumber × playersPerTeam`
- Returns `409` if the time slot conflicts with another session at the same location

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
- If this join fills the session (`members.length === maxNumber`) **and** `paymentRequired` is true, payment records are automatically initialized for all members

**Error Responses**:
- `400` — session is already full
- `409` — user is already in this session

---

### GET /sessions/:sessionId
Get a session with its members populated.

**Auth required**: Yes (JWT cookie)

**Success Response** `200 OK`: Session document with members populated (`firstName`, `lastName`, `nickname`, `avatar`).

---

### GET /sessions/members/:sessionId
Get the member list for a session (nickname only).

**Auth required**: Yes (JWT cookie)

**Success Response** `200 OK`: Session with members array.

---

### DELETE /sessions/leave/:sessionId
Leave a session.

**Auth required**: Yes (JWT cookie)

**Success Response** `200 OK`:
```json
{
  "message": "User successfully left session",
  "session": { ...updatedSessionDocument }
}
```

---

### POST /sessions/end/:sessionId
End a session. Clears all member `currentSession` references and marks location as available.

**Auth required**: Yes (JWT cookie)

**Success Response** `200 OK**:
```json
{ "message": "Session ended successfully", "session": { ...sessionDocument } }
```

---

### DELETE /sessions/delete/:sessionId
Delete a session entirely.

**Auth required**: Yes (JWT cookie)

**Success Response** `200 OK`:
```json
{ "message": "Session deleted successfully" }
```

---

### PATCH /sessions/reschedule/:sessionId
Reschedule a session to a new time.

**Auth required**: Yes (JWT cookie)

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
- `409` — overlaps with another session at the same location

---

### PATCH /sessions/matchtype
Update match type for all sessions. Admin/utility endpoint.

**Auth required**: Yes (JWT cookie)

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

### GET /sets/:setId
Get a single set by ID.

**Auth required**: Yes (JWT cookie)

**Success Response** `200 OK`: Single set document.

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
Mark a match as started.

**Auth required**: Yes (JWT cookie)

**Success Response** `200 OK`: Updated match document.

---

### GET /matches/details/:matchId
Get full details of a match.

**Auth required**: Yes (JWT cookie)

**Success Response** `200 OK`: Match document.

---

### POST /matches/end/:matchId
Mark a match as ended.

**Auth required**: Yes (JWT cookie)

**Success Response** `200 OK`: Finalized match document.

---

### PUT /matches/increment-score/:matchId
Increment the score for a team.

**Auth required**: Yes (JWT cookie)

**Query Parameters**:
- `team`: `"teamOne"` | `"teamTwo"`

**Example**: `PUT /matches/increment-score/507f...?team=teamOne`

**Success Response** `200 OK`: Updated match document with new scores.

---

### PUT /matches/decrement-score/:matchId
Decrement the score for a team.

**Auth required**: Yes (JWT cookie)

**Query Parameters**:
- `team`: `"teamOne"` | `"teamTwo"`

**Success Response** `200 OK`: Updated match document.

---

### GET /matches/stream/:matchId (SSE)
Real-time score stream for a single match.

**Auth required**: Yes (JWT cookie)

**Headers**: `Accept: text/event-stream`, `Cache-Control: no-cache`

**Events**:
```
// On connect
data: {"type":"connected","message":"Connection established","matchId":"...","userId":"...","timestamp":1234567890}

// Score update
data: {"matchId":"...","sessionId":"...","teamOneScore":3,"teamTwoScore":1}

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

### POST /tournaments/create/:locationId
Create a new tournament at a location.

**Auth required**: Yes (JWT cookie)

**Path Parameters**:
- `locationId` — location ID

**Request Body**:
```json
{
  "name": "Lagos Cup 2025",
  "description": "Annual Lagos tournament",
  "prizeMoney": 500000,
  "format": "KNOCKOUT",
  "maxTeams": 16,
  "registrationDeadline": "2025-11-01T00:00:00.000Z",
  "startDate": "2025-11-10T09:00:00.000Z",
  "durationDays": 7,
  "registrationFee": 2000
}
```

**Field Notes**:
- `format`: `"KNOCKOUT"` | `"GROUPS"` (default: `"KNOCKOUT"`)
- `maxTeams`: defaults to 16
- `endDate` is auto-computed as `startDate + durationDays`
- A unique `code` (e.g. `"I-ONE-ABCDEFG"`) is auto-generated

**Success Response** `201 Created`: Tournament document including `code`, `status: "REGISTRATION"`, `organizer`, and computed `endDate`.

---

## Stats

### GET /stats/:userId
Get overall stats for the authenticated user. The `:userId` path param is accepted but the server always returns stats for the **current user**.

**Auth required**: Yes (JWT cookie)

**Success Response** `200 OK`: Aggregated stats document.

---

### GET /stats/season
Get the authenticated user's stats for a specific season range.

**Auth required**: Yes (JWT cookie)

**Query Parameters**:
- `seasonStart` (number, required) — e.g. `202401`
- `seasonEnd` (number, required) — e.g. `202412`

**Success Response** `200 OK`: Stats document for that period.

---

### PATCH /stats/update
Update a specific stat for the authenticated user.

**Auth required**: Yes (JWT cookie)

**Query Parameters**:
- `seasonStart` (number, required)
- `seasonEnd` (number, required)

**Request Body**:
```json
{
  "statsType": "GOALS",
  "value": 2
}
```

**Success Response** `200 OK`: Updated stats document.

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

### Session Payment Flow

1. A session fills up → server automatically creates a `PENDING` payment record for every member
2. Each member calls `POST /wallet/session/:sessionId/pay` to get a Paystack checkout URL
3. Member pays via Paystack
4. Paystack sends `charge.success` webhook → server confirms payment and credits owner wallet
5. Once all members have paid, `canSessionStart()` returns `true`

---

### GET /wallet/me
Get the authenticated owner's wallet and DVA (Dedicated Virtual Account) details.

**Auth required**: Yes (JWT cookie + `IsOwnerGuard`)

**Success Response** `200 OK`:
```json
{
  "wallet": {
    "_id": "...",
    "balance": 50000,
    "ledgerBalance": 50000,
    "currency": "NGN",
    "status": "ACTIVE"
  },
  "dva": {
    "accountNumber": "1234567890",
    "bankName": "Titan-Paystack",
    "accountName": "John Doe"
  }
}
```

---

### GET /wallet/balance
Get the authenticated owner's current wallet balance.

**Auth required**: Yes (JWT cookie + `IsOwnerGuard`)

**Success Response** `200 OK`:
```json
{
  "balance": 50000,
  "ledgerBalance": 50000,
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
  "amount": 2500
}
```

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
  "amount": 10000,
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

## Admin

### GET /wallet/user/:userId
Get wallet and DVA details for any user. Super admin only.

**Auth required**: Yes (JWT cookie + `SUPER_ADMIN` role)

**Path Parameters**:
- `userId` — user ID

**Success Response** `200 OK`:
```json
{
  "wallet": { ...walletDocument },
  "dva": { ...dvaDocument }
}
```

---

### POST /admin/billing/fund-wallet
Manually credit a user's wallet. Super admin only.

**Auth required**: Yes (JWT cookie + `SUPER_ADMIN` role)

**Request Body**:
```json
{
  "userId": "507f...",
  "amount": 5000
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

## Webhooks

### POST /webhooks/paystack
Receive and process events from Paystack. **This endpoint is called by Paystack, not by your frontend.**

**Auth required**: No (validated by `x-paystack-signature` header)

**Headers**:
- `x-paystack-signature` — HMAC SHA-512 signature from Paystack

**Handled Events**:
| Event | Action |
|---|---|
| `charge.success` | If metadata has `sessionId`+`userId`: confirms session payment and credits owner wallet. Otherwise: credits the owner's wallet via DVA lookup. |
| `transfer.success` | Logs successful withdrawal |
| `transfer.failed` | Refunds the debited wallet amount |
| `transfer.reversed` | Refunds the debited wallet amount |

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
  booked: boolean;
  pitchPhoto?: string;
  location: { type: 'Point'; coordinates: [number, number] };
  friendly: boolean;
  tournament: boolean;
  tournamentFee?: number;
  owner?: string;             // User ID
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
  amount: number;
  status: 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';
  paymentReference: string;
  transactionId?: string;
  paidAt?: Date;
  expiresAt?: Date;
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
  source: 'SESSION_PAYMENT' | 'ADMIN_FUNDING' | 'WITHDRAWAL' | 'TRANSFER' | 'REFUND';
  reference: string;
  paystackReference?: string;
  description: string;
  sessionId?: string;
  createdAt: string;
  updatedAt: string;
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
