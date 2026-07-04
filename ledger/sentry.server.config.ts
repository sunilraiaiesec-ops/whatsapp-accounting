import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN;

// No-ops entirely when SENTRY_DSN is unset, so the app runs unchanged until
// monitoring is configured in the environment.
Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  // Financial app: never attach request bodies / user PII by default.
  sendDefaultPii: false,
});
