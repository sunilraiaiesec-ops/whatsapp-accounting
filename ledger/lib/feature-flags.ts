// Phone verification/recovery requires Twilio to be configured (see
// lib/sms.ts) — off until that's set up in production. Flip back to true
// once TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_FROM_NUMBER are live;
// no other code changes needed.
export const PHONE_RECOVERY_ENABLED = false;
