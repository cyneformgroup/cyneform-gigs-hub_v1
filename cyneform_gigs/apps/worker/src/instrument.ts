import * as Sentry from "@sentry/bun";

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? "development",
    release: process.env.APP_VERSION,
    tracesSampleRate: 0,
    beforeSend(event) {
      event.request = undefined;
      if (event.user) event.user = { id: event.user.id };
      return event;
    },
  });
}
