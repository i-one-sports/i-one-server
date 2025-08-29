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

**Request Body**:
```typescript
interface RegisterUserRequest {
  firstName: string;       // User's first name
  lastName: string;        // User's last name
  email: string;           // User's email address
  nickname: string;        // User's nickname
  password: string;        // User's password
  address: string;         // Physical address
  phoneNumber: string;     // Nigerian phone number format
  position: string;        // Playing position (e.g., 'MF', 'ST', 'CB', 'GK')
  location: {              // User's location coordinates
    type: 'Point';
    coordinates: [number, number]; // [longitude, latitude]
  };
  isOwner: boolean;        // Whether the user is a location owner
  height: number;          // User's height in centimeters
  dateOfBirth: string;     // ISO date string (e.g., '1990-01-01T00:00:00.000Z')
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
  "location": {
    "type": "Point",
    "coordinates": [3.3792, 6.5244]  // [longitude, latitude] for Lagos
  },
  "isOwner": false,
  "height": 180,
  "dateOfBirth": "1990-01-01T00:00:00.000Z"
}
```

**Success Response**:
- **Status Code**: 201 Created
- **Body**:
  ```json
  {
    "message": "User registered successfully",
    "user": {
      "_id": "507f1f77bcf86cd799439011",
      "email": "john.doe@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "nickname": "johndoe",
      "isVerified": false,
      "createdAt": "2023-10-01T12:00:00.000Z"
    }
  }
  ```

### 2. User Login

**Endpoint**: `POST /auth/user/login`

**Description**: Authenticates a user and returns a JWT token in an HTTP-only cookie.

**Request Body**:
```typescript
interface LoginRequest {
  email: string;      // User's email address
  password: string;   // User's password
}
```

**Example Request**:
```http
POST /user/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**Success Response**:
- **Status Code**: 200 OK
- **Headers**:
  - `Set-Cookie`: `Authentication=<jwt-token>; HttpOnly; Path=/; Max-Age=3600`
- **Body**:
  ```json
  {
    "message": "Login successful",
    "user": {
      "_id": "507f1f77bcf86cd799439011",
      "email": "user@example.com",
      "name": "John Doe"
    }
  }
  ```

### 2. User Logout

**Endpoint**: `GET /auth/user/logout`

**Description**: Logs out the current user by clearing the authentication cookie.

**Headers**:
- `Content-Type`: `application/json`

**Example Request**:
```http
GET /user/logout
```

**Success Response**:
- **Status Code**: 200 OK
- **Headers**:
  - `Set-Cookie`: `Authentication=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
- **Body**:
  ```json
  {
    "message": "Logout successful"
  }
  ```

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

### 1. Register Location

**Endpoint**: `POST /location/register`

**Description**: Registers a new sports location (for owners only).

**Headers**:
- `Content-Type`: `application/json`

**Request Body**:
```typescript
interface CreateLocationDto {
  name: string;                     // Name of the location
  address: string;                  // Physical address
  location: {                       // GeoJSON Point for the location
    type: 'Point';
    coordinates: [number, number];  // [longitude, latitude]
  };
  pitchPhoto?: string;              // URL of the pitch photo (optional)
}
```

**Example Request**:
```http
POST /location/register
Content-Type: application/json

{
  "name": "Lagos Sports Complex",
  "address": "123 Sports Avenue, Victoria Island, Lagos",
  "location": {
    "type": "Point",
    "coordinates": [3.42158, 6.45306]  // [longitude, latitude] for Victoria Island
  }
}
```

**Success Response**:
- **Status Code**: 201 Created
- **Body**:
  ```json
  {
    "_id": "507f1f77bcf86cd799439013",
    "name": "Lagos Sports Complex",
    "address": "123 Sports Avenue, Victoria Island, Lagos",
    "location": {
      "type": "Point",
      "coordinates": [3.42158, 6.45306]
    },
    "ownerId": "507f1f77bcf86cd799439011",
    "createdAt": "2023-10-01T12:00:00.000Z",
    "updatedAt": "2023-10-01T12:00:00.000Z"
  }
  ```

### 2. Upload Location Photo

**Endpoint**: `POST /location/pitch/:locationId`

**Description**: Uploads a photo for a specific location's pitch.

**Headers**:
- `Content-Type`: `multipart/form-data`

**Path Parameters**:
- `locationId`: string - ID of the location

**Form Data**:
- `file`: File - Image file to upload (JPG, PNG, etc.)

**Example Request**:
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
  {
    "pitchPhoto": "https://your-s3-bucket.s3.amazonaws.com/pitches/507f1f77bcf86cd799439013.jpg"
  }
  ```

### 3. Get Nearby Locations

**Endpoint**: `GET /location/nearby`

**Description**: Finds locations near the specified coordinates.

**Query Parameters**:
- `longitude`: string - Longitude of the center point
- `latitude`: string - Latitude of the center point
- `maxDistance?`: number - (Optional) Maximum distance in meters (default: 5000)

**Headers**:
- `Content-Type`: `application/json`

**Example Request**:
```http
GET /location/nearby?longitude=3.42158&latitude=6.45306&maxDistance=10000
```

**Success Response**:
- **Status Code**: 200 OK
- **Body**:
  ```json
  [
    {
      "_id": "507f1f77bcf86cd799439013",
      "name": "Lagos Sports Complex",
      "address": "123 Sports Avenue, Victoria Island, Lagos",
      "location": {
        "type": "Point",
        "coordinates": [3.42158, 6.45306]
      },
      "pitchPhoto": "https://your-s3-bucket.s3.amazonaws.com/pitches/507f1f77bcf86cd799439013.jpg",
      "distance": 1.2  // Distance in meters
    }
  ]
  ```

### 4. Get My Location (Owner)

**Endpoint**: `GET /location`

**Description**: Retrieves the location owned by the authenticated user (for owners only).

**Headers**:
- `Content-Type`: `application/json`

**Example Request**:
```http
GET /location
```

**Success Response**:
- **Status Code**: 200 OK
- **Body**: Same as the location object in the register location response

## Session Management

### 1. Find Nearby Sessions

**Endpoint**: `GET /sessions/nearby-sessions`

**Description**: Finds sessions near the specified coordinates.

**Query Parameters**:
- `lat`: number - Latitude of the location
- `lng`: number - Longitude of the location

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
  startTime: string;           // ISO date string
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

### 1. Create a Set

**Endpoint**: `POST /sets/create/:sessionId`

**Description**: Creates a new set for a session.

**Path Parameters**:
- `sessionId`: string - ID of the session

**Headers**:
- `Content-Type`: `application/json`

**Request Body**:
```typescript
interface CreateSetRequest {
  name?: string;           // Optional name for the set
  targetScore?: number;    // Target score to win the set (default: 21)
  winByTwo?: boolean;      // Whether to win by 2 points (default: true)
}
```

**Example Request**:
```http
POST /sets/create/507f1f77bcf86cd799439014
Content-Type: application/json

{
  "name": "First Set",
  "targetScore": 21,
  "winByTwo": true
}
```

**Success Response**:
- **Status Code**: 201 Created
- **Body**:
  ```json
  {
    "_id": "507f1f77bcf86cd799439015",
    "sessionId": "507f1f77bcf86cd799439014",
    "name": "First Set",
    "targetScore": 21,
    "winByTwo": true,
    "status": "in_progress",
    "createdAt": "2023-10-01T15:05:00.000Z",
    "updatedAt": "2023-10-01T15:05:00.000Z"
  }
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
