import { SetMetadata } from '@nestjs/common';

export const GUEST_READABLE_KEY = 'guestReadable';

// Opens a read-only route to signed-out users (App Store 5.1.1(v): browsing
// without an account). JwtAuthGuard still runs: with a valid token the
// request is authenticated as usual; with no token (or a bad one) it carries
// on with no user. The handler must then return a guest view — see
// src/guest/guest-views.ts — never the signed-in payload.
export const GuestReadable = () => SetMetadata(GUEST_READABLE_KEY, true);
