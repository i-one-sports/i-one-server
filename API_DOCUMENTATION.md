# Comprehensive API Documentation

## Table of Contents
1. [Base URL and Authentication](#base-url-and-authentication)
2. [Authentication Endpoints](#authentication-endpoints)
3. [User Management](#user-management)
4. [Location Management](#location-management)
5. [Session Management](#session-management)
6. [Sets Management](#sets-management)
7. [Error Handling](#error-handling)
8. [Types and Interfaces](#types-and-interfaces)

## Base URL and Authentication

**Base URL**: `https://i-one-server-v1.onrender.com/i-one`

### Authentication Flow
1. User logs in using `/user/login` endpoint
2. Server responds with an HTTP-only cookie containing the session token
3. For subsequent requests, the browser automatically includes the cookie
4. The server validates the session on each request

> **Note**: The API uses HTTP-only cookies for authentication. No need to manually handle tokens - the browser will handle authentication automatically after login.

## Authentication Endpoints

### 1. User Registration

**Endpoint**: `POST /user/register`

**Description**: Registers a new user in the system.

**Request Body** (matches `registerUserRequest` DTO):
```typescript
interface registerUserRequest {
  firstName: string;
  lastName: string;
  email: string;
  nickname: string;
  password: string;
  address: string;
  avatar?: string;
  phoneNumber: string; // expects NG phone format
  position: string; // e.g., 'MF', 'ST', 'CB', 'GK'
  location: { type: 'Point'; coordinates: [number, number] };
  isOwner: boolean;
  height: number;
  dateOfBirth: string; // ISO date string
}
```

**Example Request**:
```http
POST /user/register
Content-Type: application/json

{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john.doe@example.com",
  "nickname": "johndoe",
  "password": "securePassword123",
  "address": "123 Main St, Lagos",
  "phoneNumber": "+2348012345678",
  "position": "ST",
  "location": { "type": "Point", "coordinates": [3.3792, 6.5244] },
  "isOwner": false,
  "height": 180,
  "dateOfBirth": "1990-01-01T00:00:00.000Z"
}
```

**Success Response**:
- **Status Code**: 201 Created
- **Body**: Same minimal user info as before (id, email, createdAt, etc.)

### 2. User Login

**Endpoint**: `POST /auth/user/login`

**Description**: Authenticates a user using the `LocalGuard` and sets an HTTP-only cookie on success.

**Request Body**:
```typescript
interface LoginRequest { email: string; password: string }
```

**Example Request**:
```http
POST /auth/user/login
Content-Type: application/json

{ "email": "user@example.com", "password": "securePassword123" }
```

**Success Response**:
- **Status Code**: 200 OK
- **Headers**: `Set-Cookie: Authentication=<jwt-token>; HttpOnly; Path=/;` (server sets cookie)
- **Body**: A small user object is returned on success.

### 3. User Logout

**Endpoint**: `GET /auth/user/logout`

**Description**: Clears the authentication cookie.

**Example Request**:
```http
GET /auth/user/logout
```

**Success Response**:
- **Status Code**: 200 OK
- **Headers**: `Set-Cookie` clearing the Authentication cookie
- **Body**: { "message": "Logout successful" }

## User Management

### 1. Get User Profile

**Endpoint**: `GET /user/profile`

**Description**: Retrieves the authenticated user's profile information.

**Headers**:
- `Content-Type`: `application/json`

**Example Request**:
```http
GET /user/profile
```

**Success Response**:
- **Status Code**: 200 OK
- **Body**:
  ```json
  {
    "_id": "507f1f77bcf86cd799439011",
    "firstName": "John",
    "lastName": "Doe",
    "email": "john.doe@example.com",
    "phoneNumber": "+1234567890",
    "userType": "player",
    "gender": "male",
    "dateOfBirth": "1990-01-01T00:00:00.000Z",
    "isVerified": true,
    "createdAt": "2023-10-01T12:00:00.000Z",
    "updatedAt": "2023-10-01T12:00:00.000Z"
  }
  ```

### 0. Get Current User

**Endpoint**: `GET /user`

**Description**: Returns the authenticated user's basic record (requires authentication cookie).

**Headers**:
- `Content-Type`: `application/json`

**Example Request**:
```http
GET /user
```

**Success Response**:
- **Status Code**: 200 OK
- **Body**: User object similar to `/user/profile` response.

### 5. Upload Avatar

**Endpoint**: `POST /user/avatar`

**Description**: Uploads an avatar image. This endpoint does not require authentication and is intended to be used during the registration flow. The returned avatar URL can be included in the registration request.

**Headers**:
- `Content-Type`: `multipart/form-data`

**Form Data**:
- `file`: File - Image file to upload (JPG, PNG, etc.)

**Example Request** (multipart/form-data):
```http
POST /user/avatar
Content-Type: multipart/form-data; boundary=----WebKitFormBoundary

------WebKitFormBoundary
Content-Disposition: form-data; name="file"; filename="avatar.jpg"
Content-Type: image/jpeg

<binary data>
------WebKitFormBoundary--
```

**Success Response**:
- **Status Code**: 201 Created
- **Body**:
  ```json
  {
    "avatar": "https://your-s3-bucket.s3.amazonaws.com/users/1702656000000/abc123.jpg"
  }
  ```

**Error Responses**:
- **500 Internal Server Error**: Failed to upload file to S3

**Usage in Registration Flow**:
1. Upload avatar using this endpoint
2. Receive the avatar URL in response
3. Include the avatar URL in the `POST /user/register` request body

### 2. Forgot Password

**Endpoint**: `POST /user/forget-password`

**Description**: Initiates password reset process by sending OTP to user's email.

**Request Body**:
```typescript
interface ForgotPasswordDto {
  email: string;
}
```

**Example Request**:
```http
POST /user/forget-password
Content-Type: application/json

{
  "email": "john.doe@example.com"
}
```

**Success Response**:
- **Status Code**: 200 OK
- **Body**:
  ```json
  {
    "message": "Password reset OTP sent to email"
  }
  ```

### 3. Verify OTP

**Endpoint**: `POST /user/verify-otp`

**Description**: Verifies the OTP for password reset.

**Request Body**:
```typescript
interface VerifyOtpDto {
  email: string;
  otp: string;
}
```

**Example Request**:
```http
POST /user/verify-otp
Content-Type: application/json

{
  "email": "john.doe@example.com",
  "otp": "123456"
}
```

**Success Response**:
- **Status Code**: 200 OK
- **Body**:
  ```json
  {
    "message": "OTP verified successfully",
    "resetToken": "valid-reset-token"
  }
  ```

### 4. Reset Password

**Endpoint**: `PUT /user/reset-password`

**Description**: Resets the user's password using the reset token.

**Request Body**:
```typescript
interface ResetPasswordDto {
  email: string;
  password: string;
  confirmPassword: string;
  resetToken: string;
}
```

**Example Request**:
```http
PUT /user/reset-password
Content-Type: application/json

{
  "email": "john.doe@example.com",
  "password": "newSecurePassword123",
  "confirmPassword": "newSecurePassword123",
  "resetToken": "valid-reset-token"
}
```

**Success Response**:
- **Status Code**: 200 OK
- **Body**:
  ```json
  {
    "message": "Password reset successful"
  }
  ```

## Location Management

### Overview

The Location feature manages sports locations (pitches). The implementation exposes endpoints under the `/location` prefix. The runtime model (schema) stores the following important fields on a `Location` document:

- `name` (string)
- `address` (string)
- `booked` (boolean, default false)
- `pitchPhoto` (string, optional)
- `location` (GeoJSON Point { type: 'Point', coordinates: [lng, lat] })
- `friendly` (boolean, default true)
- `tournament` (boolean, default true)
- `tournamentFee` (number, optional)
- timestamps: `createdAt`, `updatedAt`

The controller and DTOs to note are `POST /location/register` (owner-only), `GET /location/nearby`, `GET /location/all`, `GET /location` (owner's location), and `POST /location/pitch/:locationId` (upload photo).

### 1. Register Location

**Endpoint**: `POST /location/register`

**Description**: Register a new sports location. This route is guarded with an owner check in the controller (only users with owner privileges may call it).

**Headers**:
- `Content-Type`: `application/json`
- Requires authentication cookie (HTTP-only)

**Request Body** (matches `CreateLocationDto`):
```typescript
interface CreateLocationDto {
  name: string;                     // required
  address: string;                  // required
  location: {                       // required: GeoJSON Point
    type: 'Point';
    coordinates: [number, number];  // [longitude, latitude]
  };
  pitchPhoto?: string;              // optional URL
  friendly?: boolean;               // optional (defaults to true)
  tournament?: boolean;             // optional (defaults to true)
}
```

**Behavior / Notes**:
- The service checks for an existing location very close to the provided coordinates and will return 409 Conflict if an existing location is found.
- The server currently stores `name`, `address`, `location`, `pitchPhoto` and uses schema defaults for `friendly` and `tournament`.

**Example Request**:
```http
POST /location/register
Content-Type: application/json
Cookie: Authentication=<jwt-cookie>

{
  "name": "Lagos Sports Complex",
  "address": "123 Sports Avenue, Victoria Island, Lagos",
  "location": {
    "type": "Point",
    "coordinates": [3.42158, 6.45306]
  },
  "pitchPhoto": "https://example.com/pitches/lagos.jpg"
}
```

**Success Response**:
- **Status Code**: 201 Created
- **Body** (Location document):
  ```json
  {
    "_id": "507f1f77bcf86cd799439013",
    "name": "Lagos Sports Complex",
    "address": "123 Sports Avenue, Victoria Island, Lagos",
    "booked": false,
    "pitchPhoto": "https://example.com/pitches/lagos.jpg",
    "location": { "type": "Point", "coordinates": [3.42158, 6.45306] },
    "friendly": true,
    "tournament": true,
    "tournamentFee": null,
    "createdAt": "2023-10-01T12:00:00.000Z",
    "updatedAt": "2023-10-01T12:00:00.000Z"
  }
  ```

### 2. Upload Location Pitch Photo

**Endpoint**: `POST /location/pitch/:locationId`

**Description**: Uploads a photo for a specific location's pitch. The controller uses a memory-storage multer interceptor and delegates to `AwsService.upload`. Returns the uploaded file URL.

**Headers**:
- `Content-Type`: `multipart/form-data`

**Path Parameters**:
- `locationId`: string - ID of the location

**Form Data**:
- `file`: File - Image file to upload (JPG, PNG, etc.)

**Example Request** (multipart/form-data):
```http
POST /location/pitch/507f1f77bcf86cd799439013
Content-Type: multipart/form-data; boundary=----WebKitFormBoundary

------WebKitFormBoundary
Content-Disposition: form-data; name="file"; filename="pitch.jpg"
Content-Type: image/jpeg

<binary data>
------WebKitFormBoundary--
```

**Success Response**:
- **Status Code**: 200 OK
- **Body**:
  ```json
  { "pitchPhoto": "https://your-s3-bucket.s3.amazonaws.com/pitches/507f1f77bcf86cd799439013.jpg" }
  ```

### 3. View All Locations

**Endpoint**: `GET /location/all`

**Description**: Returns all location documents.

**Headers**:
- `Content-Type`: `application/json`

**Success Response**:
- **Status Code**: 200 OK
- **Body**: Array of Location documents (same shape as register response)

### 4. Get Nearby Locations

**Endpoint**: `GET /location/nearby`

**Description**: Finds locations near the specified coordinates. Note: the controller expects query parameters named `lng` and `lat` (not `longitude`/`latitude`).

**Query Parameters**:
- `lng`: number - Longitude of the center point (required)
- `lat`: number - Latitude of the center point (required)
- `maxDistance?`: number - (Optional) Maximum distance in meters (the current implementation ignores this parameter; the service performs a `$near` query and returns matching documents sorted by distance)

**Example Request**:
```http
GET /location/nearby?lng=3.42158&lat=6.45306
```

**Success Response**:
- **Status Code**: 200 OK
- **Body**: Array of Location documents (same shape as register response). The raw documents do not include a computed `distance` field unless an aggregation is used; they are returned ordered by proximity.

### 5. Get My Location (Owner)

**Endpoint**: `GET /location`

**Description**: Returns location information associated with the authenticated user. The controller reads the user's `locationInfo` and returns a compact response containing the stored `locationInfo`, `address`, and `coordinates`.

**Headers**:
- `Content-Type`: `application/json`
- Requires authentication cookie (HTTP-only)

**Success Response**:
- **Status Code**: 200 OK
- **Body**:
  ```json
  {
    "locationInfo": { /* user's stored location object */ },
    "address": "123 Sports Avenue, Victoria Island, Lagos",
    "coordinates": [3.42158, 6.45306]
  }
  ```

**Errors**:
- 404 Not Found if the user is not found or has no location information

## Session Management

### 1. Find Nearby Sessions

**Endpoint**: `GET /sessions/nearby-sessions`

**Description**: Finds sessions near the specified coordinates.

**Query Parameters**:
- `lng`: number - Longitude of the location (controller reads `lng`)
- `lat`: number - Latitude of the location (controller reads `lat`)

**Headers**:
- `Content-Type`: `application/json`

**Example Request**:
```http
GET /sessions/nearby-sessions?lat=6.5244&lng=3.3792
```

**Success Response**:
- **Status Code**: 200 OK
- **Body**: Array of session objects with location details

### 2. View All Sessions

**Endpoint**: `GET /sessions/all`

**Description**: Retrieves all sessions.

**Headers**:
- `Content-Type`: `application/json`

**Example Request**:
```http
GET /sessions/all
```

**Success Response**:
- **Status Code**: 200 OK
- **Body**: Array of all session objects

### 3. Start a Session

**Endpoint**: `POST /sessions/start`

**Description**: Starts a new session at the specified location.

**Headers**:
- `Content-Type`: `application/json`

**Request Body**:
```typescript
interface StartSessionRequest {
  locationId: string;  // ID of the location
}
```

**Example Request**:
```http
POST /sessions/start
Content-Type: application/json

{
  "locationId": "507f1f77bcf86cd799439013"
}
```

**Success Response**:
- **Status Code**: 201 Created
- **Body**:
  ```json
  {
    "_id": "507f1f77bcf86cd799439014",
    "locationId": "507f1f77bcf86cd799439013",
    "startTime": "2023-10-01T15:00:00.000Z",
    "status": "active",
    "createdBy": "507f1f77bcf86cd799439011",
    "createdAt": "2023-10-01T14:30:00.000Z",
    "updatedAt": "2023-10-01T14:30:00.000Z"
  }
  ```

### 4. Create Session

**Endpoint**: `POST /sessions/create/:sessionId`

**Description**: Creates a session with the given ID and details.

**Path Parameters**:
- `sessionId`: string - The ID for the new session

**Headers**:
- `Content-Type`: `application/json`

**Request Body**:
```typescript
{
  setNumber: number;           // Number of sets in the session
  playersPerTeam: number;      // Number of players per team
  timeDuration: number;        // Total duration in minutes
  minsPerSet: number;          // Minutes per set
  startTime: string;           // ISO date string (ISO 8601)
  winningDecider: string;      // How to determine the winner
}
```

**Example Request**:
```http
POST /sessions/create/sess_12345
Content-Type: application/json

{
  "setNumber": 3,
  "playersPerTeam": 5,
  "timeDuration": 90,
  "minsPerSet": 30,
  "startTime": "2023-10-01T15:00:00.000Z",
  "winningDecider": "most_sets"
}
```

### 5. Join Session

**Endpoint**: `POST /sessions/join/:sessionId`

**Description**: Join an existing session.

**Path Parameters**:
- `sessionId`: string - ID of the session to join

**Headers**:
- `Content-Type`: `application/json`

**Example Request**:
```http
POST /sessions/join/sess_12345
```

### 6. View Session

**Endpoint**: `GET /sessions/:sessionId`

**Description**: Get details of a specific session.

**Path Parameters**:
- `sessionId`: string - ID of the session

**Headers**:
- `Content-Type`: `application/json`

**Example Request**:
```http
GET /sessions/sess_12345
```

### 7. View Session Members

**Endpoint**: `GET /sessions/members/:sessionId`

**Description**: Get list of members in a session.

**Path Parameters**:
- `sessionId`: string - ID of the session

**Headers**:
- `Content-Type`: `application/json`

### 8. Leave Session

**Endpoint**: `DELETE /sessions/leave/:sessionId`

**Description**: Leave a session.

**Path Parameters**:
- `sessionId`: string - ID of the session to leave

**Headers**:
- `Content-Type`: `application/json`

### 9. End Session

**Endpoint**: `POST /sessions/end/:sessionId`

**Description**: End a session.

**Path Parameters**:
- `sessionId`: string - ID of the session to end

**Headers**:
- `Content-Type`: `application/json`

### 10. Delete Session

**Endpoint**: `DELETE /sessions/delete/:sessionId`

**Description**: Delete a session.

**Path Parameters**:
- `sessionId`: string - ID of the session to delete

**Headers**:
- `Content-Type`: `application/json`

### 11. Reschedule Session

**Endpoint**: `PATCH /sessions/reschedule/:sessionId`

**Description**: Reschedule a session.

**Path Parameters**:
- `sessionId`: string - ID of the session to reschedule

**Headers**:
- `Content-Type`: `application/json`

**Request Body**:
```typescript
{
  startTime: string;    // New start time (ISO date string)
  timeDuration: number; // New duration in minutes
}
```

**Example Request**:
```http
PATCH /sessions/reschedule/sess_12345
Content-Type: application/json
Cookie: auth-token=<token>

{
  "startTime": "2023-10-01T16:00:00.000Z",
  "timeDuration": 120
}
```

## Sets Management

### 1. Create Sets for Session

**Endpoint**: `POST /sets/create/:sessionId`

**Description**: Creates sets for a session. The number of sets created is determined by the session's `setNumber` property. Set names are automatically assigned from a predefined list of team names.

**Path Parameters**:
- `sessionId` (required): The ID of the session to create sets for

**Headers**:
- `Content-Type`: `application/json`
- `Cookie`: `auth-token=<token>`

**Request Body**: None

**Example Request**:
```http
POST /sets/create/507f1f77bcf86cd799439014
Content-Type: application/json
Cookie: auth-token=<token>
```

**Success Response**:
- **Status Code**: 201 Created
- **Body**: Array of created sets with auto-assigned team names
  ```json
  [
    {
      "_id": "507f1f77bcf86cd799439015",
      "session": "507f1f77bcf86cd799439014",
      "name": "Team 7",
      "players": ["user1_id", "user2_id"],
      "status": "pending",
      "createdAt": "2023-10-01T15:00:00.000Z",
      "updatedAt": "2023-10-01T15:00:00.000Z"
    },
    {
      "_id": "507f1f77bcf86cd799439016",
      "session": "507f1f77bcf86cd799439014",
      "name": "Royal Knights",
      "players": ["user3_id", "user4_id"],
      "status": "pending",
      "createdAt": "2023-10-01T15:00:00.000Z",
      "updatedAt": "2023-10-01T15:00:00.000Z"
    }
  ]
  ```

### 2. View Set for Session

**Endpoint**: `GET /sets/:sessionId`

**Description**: Retrieves all sets for a specific session.

**Path Parameters**:
- `sessionId`: string - ID of the session

**Headers**:
- `Content-Type`: `application/json`

**Example Request**:
```http
GET /sets/507f1f77bcf86cd799439014
```

**Success Response**:
- **Status Code**: 200 OK
- **Body**:
  ```json
  [
    {
      "_id": "507f1f77bcf86cd799439015",
      "sessionId": "507f1f77bcf86cd799439014",
      "name": "First Set",
      "targetScore": 21,
      "winByTwo": true,
      "status": "in_progress",
      "scores": {
        "team1": 0,
        "team2": 0
      },
      "createdAt": "2023-10-01T15:05:00.000Z",
      "updatedAt": "2023-10-01T15:05:00.000Z"
    }
  ]
  ```

## Error Handling

## Tournaments

### 1. Create Tournament

**Endpoint**: `POST /tournaments/create/:locationId`

**Description**: Create a new tournament. The authenticated user becomes the organizer. The `locationId` is supplied as a path parameter or query parameter depending on the client (controller expects `locationId`).

**Headers**:
- `Content-Type`: `application/json`
- Requires authentication cookie (HTTP-only)

**Request Body** (matches `CreateTournamentDto`):
```typescript
interface CreateTournamentRequest {
  name: string;                 // Tournament name
  description?: string;         // Optional description
  prizeMoney: number;           // Prize money (required)
  format?: 'KNOCKOUT' | 'GROUPS' | string; // Optional format, defaults to KNOCKOUT
  maxTeams?: number;            // Optional, defaults to 16
  registrationDeadline: string; // ISO date string, required
  startDate: string;            // ISO date string, required
  durationDays: number;         // Number of days the tournament runs, required
  registrationFee: number;      // Fee to register a team, required
}
```

**Path / Query Parameters**:
- `locationId`: string - ID of the `Location` where the tournament will be held (controller expects this value)

**Example Request**:
```http
POST /tournaments/create/507f1f77bcf86cd799439013
Content-Type: application/json
Cookie: Authentication=<jwt-cookie>

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

**Success Response**:
- **Status Code**: 201 Created
- **Body**:
  ```json
  {
    "_id": "507f1f77bcf86cd799439099",
    "name": "Lagos Cup 2025",
    "description": "Annual Lagos tournament",
    "prizeMoney": 500000,
    "format": "KNOCKOUT",
    "maxTeams": 16,
    "registrationDeadline": "2025-11-01T00:00:00.000Z",
    "startDate": "2025-11-10T09:00:00.000Z",
    "durationDays": 7,
    "registrationFee": 2000,
    "code": "I-ONE-ABCDEFG",         // system generated
    "status": "REGISTRATION",       // initial status
    "organizer": "507f1f77bcf86cd799439011",
    "location": "507f1f77bcf86cd799439013",
    "registeredTeams": [],
    "endDate": "2025-11-17T09:00:00.000Z"
  }
  ```

**Notes & Validation**:
- `prizeMoney`, `registrationDeadline`, `startDate`, `durationDays`, and `registrationFee` are required by the DTO.
- The server generates a unique `code`, assigns the `organizer` from the authenticated user, and calculates `endDate` from `startDate + durationDays`.
- `location` is stored by the server based on the provided `locationId` (this doc does not change the location design).
- If `maxTeams` is omitted it defaults to 16.
### Matches

The Matches API manages match creation, starting, ending, and viewing details. Routes are under the `/matches` prefix and require authentication.

#### 1. Create Matchups for Session

**Endpoint**: `POST /matches/matchup/:sessionId`

**Description**: Generate matchups for a session (creates scheduled match documents for the session). The service determines match pairings based on session state.

**Path Parameters**:
- `sessionId`: string - ID of the session

**Headers**:
- `Authorization: Bearer <token>`

**Example Request**:
```http
POST /matches/matchup/507f1f77bcf86cd799439014
Authorization: Bearer <token>
```

**Success Response**:
- **Status Code**: 201 Created
- **Body**: Array of created Match documents

#### 2. View Session Matchups

**Endpoint**: `GET /matches/matchups/:sessionId`

**Description**: Returns matchups for the given session.

**Path Parameters**:
- `sessionId`: string - ID of the session

**Headers**:
- `Authorization: Bearer <token>`

**Example Request**:
```http
GET /matches/matchups/507f1f77bcf86cd799439014
Authorization: Bearer <token>
```

**Success Response**:
- **Status Code**: 200 OK
- **Body**: Array of match documents

#### 3. Start a Match

**Endpoint**: `POST /matches/start/:matchId`

**Description**: Mark a match as started.

**Path Parameters**:
- `matchId`: string - ID of the match

**Headers**:
- `Authorization: Bearer <token>`

**Example Request**:
```http
POST /matches/start/507f1f77bcf86cd799439050
Authorization: Bearer <token>
```

**Success Response**:
- **Status Code**: 200 OK
- **Body**: Updated match document

#### 4. View Match Details

**Endpoint**: `GET /matches/details/:matchId`

**Description**: Retrieve details for a specific match.

**Path Parameters**:
- `matchId`: string - ID of the match

**Headers**:
- `Authorization: Bearer <token>`

**Example Request**:
```http
GET /matches/details/507f1f77bcf86cd799439050
Authorization: Bearer <token>
```

**Success Response**:
- **Status Code**: 200 OK
- **Body**: Match document with details

#### 5. End a Match

**Endpoint**: `POST /matches/end/:matchId`

**Description**: Mark a match as ended and record results.

**Path Parameters**:
- `matchId`: string - ID of the match

**Headers**:
- `Authorization: Bearer <token>`

**Example Request**:
```http
POST /matches/end/507f1f77bcf86cd799439050
Authorization: Bearer <token>
```

**Success Response**:
- **Status Code**: 200 OK
- **Body**: Finalized match document

#### 6. Increment Match Score

**Endpoint**: `PUT /matches/increment-score/:matchId`

**Description**: Increment the score for a specific team in a match. This triggers real-time updates via SSE.

**Path Parameters**:
- `matchId`: string - ID of the match

**Query Parameters**:
- `team`: 'teamOne' | 'teamTwo' - Which team's score to increment

**Headers**:
- `Authorization: Bearer <token>`

**Example Request**:
```http
PUT /matches/increment-score/507f1f77bcf86cd799439050?team=teamOne
Authorization: Bearer <token>
```

**Success Response**:
- **Status Code**: 200 OK
- **Body**: Updated match document with new scores
  ```json
  {
    "_id": "507f1f77bcf86cd799439050",
    "teamOne": "507f1f77bcf86cd799439015",
    "teamTwo": "507f1f77bcf86cd799439016", 
    "teamOneScore": 3,
    "teamTwoScore": 1,
    "isStarted": true,
    "session": "507f1f77bcf86cd799439014"
  }
  ```

#### 7. Decrement Match Score

**Endpoint**: `PUT /matches/decrement-score/:matchId`

**Description**: Decrement the score for a specific team in a match. This triggers real-time updates via SSE.

**Path Parameters**:
- `matchId`: string - ID of the match

**Query Parameters**:
- `team`: 'teamOne' | 'teamTwo' - Which team's score to decrement

**Headers**:
- `Authorization: Bearer <token>`

**Example Request**:
```http
PUT /matches/decrement-score/507f1f77bcf86cd799439050?team=teamTwo
Authorization: Bearer <token>
```

**Success Response**:
- **Status Code**: 200 OK
- **Body**: Updated match document with new scores

#### 8. Match Score Stream (SSE)

**Endpoint**: `GET /matches/stream/:matchId`

**Description**: Server-Sent Events stream for real-time match score updates. Provides live updates when scores change.

**Path Parameters**:
- `matchId`: string - ID of the match to watch

**Headers**:
- `Authorization: Bearer <token>`
- `Accept: text/event-stream`
- `Cache-Control: no-cache`

**Example Request**:
```http
GET /matches/stream/507f1f77bcf86cd799439050
Authorization: Bearer <token>
Accept: text/event-stream
Cache-Control: no-cache
```

**SSE Response Events**:

**Connection Established:**
```
data: {"type":"connected","message":"Connection established","matchId":"507f1f77bcf86cd799439050"}
```

**Score Updates:**
```
data: {"matchId":"507f1f77bcf86cd799439050","teamOneScore":3,"teamTwoScore":1}
```

**Heartbeat (every 30s):**
```
data: {"type":"heartbeat","timestamp":1732896234567}
```

#### 9. All Matches Stream (SSE)

**Endpoint**: `GET /matches/stream`

**Description**: Server-Sent Events stream for all match score updates. Useful for dashboards monitoring multiple matches.

**Headers**:
- `Authorization: Bearer <token>`
- `Accept: text/event-stream`
- `Cache-Control: no-cache`

**Example Request**:
```http
GET /matches/stream
Authorization: Bearer <token>
Accept: text/event-stream
Cache-Control: no-cache
```

**SSE Response Events**:
Similar to single match stream but includes updates from all matches in the system.

### Stats

The Stats API exposes endpoints for getting and updating user statistics. The controller is guarded and typically operates on the authenticated user.

#### 1. Overall User Stats

**Endpoint**: `GET /stats/:userId`

**Description**: In the current implementation this endpoint returns statistics for the authenticated user (the controller reads the current user via `@CurrentUser()`); the path parameter is not used. It returns an aggregated overview for the current user.

**Example Request**:
```http
GET /stats/507f1f77bcf86cd799439011
```

**Success Response**:
- **Status Code**: 200 OK
- **Body**: Aggregated stats for the current user

#### 2. Get User Stats By Season

**Endpoint**: `GET /stats/season`

**Query Parameters** (matches `statsQueryDto`):
- `seasonStart`: number (required)
- `seasonEnd`: number (required)

**Description**: Returns stats for the authenticated user for the given season range.

**Example Request**:
```http
GET /stats/season?seasonStart=202401&seasonEnd=202412
```

**Success Response**:
- **Status Code**: 200 OK
- **Body**: Stats for the specified season range

#### 3. Update Stats

**Endpoint**: `PATCH /stats/update`

**Query Parameters**: (seasonStart, seasonEnd) — same as `statsQueryDto`.

**Request Body** (matches `updateStatsDto`):
```typescript
interface updateStatsDto {
  statsType: string; // enum STATS
  value: number;
}
```

**Description**: Update a specific stat for the authenticated user for the provided season range.

**Example Request**:
```http
PATCH /stats/update?seasonStart=202401&seasonEnd=202412
Content-Type: application/json

{ "statsType": "GOALS", "value": 2 }
```

**Success Response**:
- **Status Code**: 200 OK
- **Body**: Updated stats object

### Error Response Format

## Captains

### Overview

Captains represent users assigned as the captain for a Team or a Set (session). The `Captain` document stores `userId` and either `teamId` or `sessionId`.

### 1. Get Team/Set Captain

**Endpoint**: `GET /captains/:id`

**Description**: Returns the captain (user) for the specified team or set. The `:id` parameter is the Team ID or Set ID; the service searches for a Captain whose `teamId` or `setId` (sessionId) matches `:id` and returns the populated `userId` object.

**Path Parameters**:
- `id`: string - Team ID or Set ID

**Example Request**:
```http
GET /captains/507f1f77bcf86cd799439020
```

**Success Response**:
- **Status Code**: 200 OK
- **Body**: The populated `userId` object (the captain user document). Example:
  ```json
  {
    "_id": "507f1f77bcf86cd799439011",
    "firstName": "John",
    "lastName": "Doe",
    "email": "john.doe@example.com"
  }
  ```

**Errors**:
- 404 Not Found if no captain exists for the provided id.

### 2. Create Captain (DTO)

There is no public POST endpoint currently in `CaptainsController`. Captains are created by calling `CaptainsService.createCaptain` from server code. If you want a public API to create captains, add a secure POST route that delegates to that service.

`CreateCaptainDto` shape (used by the service):
```typescript
interface CreateCaptainDto {
  userId: string;        // MongoId of user to be made captain (required)
  sessionId?: string;    // MongoId of session/set (optional)
  teamId?: string;       // MongoId of team (optional)
}
```

**Service behavior / validation**:
- The service prevents a user from being made captain for the same team or set more than once and will return 409 Conflict on duplicates.
- The service returns the created Captain document on success.


### Error Response Format
All error responses follow this format:

```json
{
  "statusCode": number,
  "message": string,
  "error": string,
  "timestamp": string,
  "path": string
}
```

### Common Error Status Codes
- **400 Bad Request**: Invalid request data
- **401 Unauthorized**: Missing or invalid authentication token
- **403 Forbidden**: User doesn't have permission
- **404 Not Found**: Resource not found
- **409 Conflict**: Resource conflict (e.g., duplicate email)
- **500 Internal Server Error**: Server error

## Types and Interfaces

### User
```typescript
interface User {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  userType: 'player' | 'owner';
  gender?: 'male' | 'female' | 'other';
  dateOfBirth?: string;
  isVerified: boolean;
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
  city: string;
  state: string;
  country: string;
  postalCode: string;
  location: {
    type: 'Point';
    coordinates: [number, number]; // [longitude, latitude]
  };
  ownerId: string;
  facilities?: string[];
  openingHours?: {
    day: string;
    open: string;
    close: string;
  }[];
  contactPhone?: string;
  contactEmail?: string;
  pitchPhoto?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
```

### Session

### User
```typescript
interface User {
  _id: string;
  email: string;
  name: string;
  role: 'user' | 'admin';
  createdAt: string;
  updatedAt: string;
}
```

### Session
```typescript
interface Session {
  _id: string;
  locationId: string;
  name?: string;
  notes?: string;
  startTime: string;
  endTime?: string;
  status: 'pending' | 'active' | 'completed' | 'cancelled';
  participants: string[]; // Array of user IDs
  createdBy: string; // User ID
  createdAt: string;
  updatedAt: string;
}
```

### Set
```typescript
interface Set {
  _id: string;
  sessionId: string;
  name?: string;
  targetScore: number;
  winByTwo: boolean;
  status: 'not_started' | 'in_progress' | 'completed';
  scores: {
    team1: number;
    team2: number;
  };
  winner?: 'team1' | 'team2';
  createdAt: string;
  updatedAt: string;
}
```
