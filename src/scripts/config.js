// src/scripts/config.js
export const GOOGLE_CLIENT_ID =
  (import.meta.env?.PUBLIC_GOOGLE_CLIENT_ID ?? '').trim() ||
  '131580325520-73jrf8i9o54nhitc64etc4ppk41qkin4.apps.googleusercontent.com';

export const API_BASE_URL =
  (import.meta.env?.PUBLIC_API_BASE_URL ?? '').trim() ||
  'https://lostnet-api.tail0e8b19.ts.net/api';