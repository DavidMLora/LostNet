// src/scripts/config.js
export const GOOGLE_CLIENT_ID =
  (import.meta.env?.PUBLIC_GOOGLE_CLIENT_ID ?? '').trim();

export const API_BASE_URL =
  (import.meta.env?.PUBLIC_API_BASE_URL ?? '').trim() ||
  'https://lostnet-api.tail0e8b19.ts.net/api';