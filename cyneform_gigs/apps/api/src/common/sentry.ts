import { HttpException } from "@nestjs/common";
import * as Sentry from "@sentry/bun";

export function captureServerError(
  exception: unknown,
  ctx?: { userId?: string; method?: string; path?: string },
) {
  if (!process.env.SENTRY_DSN) return;
  if (exception instanceof HttpException && exception.getStatus() < 500) return;
  const status = (exception as { status?: number } | null)?.status;
  if (typeof status === "number" && status < 500) return;
  Sentry.withScope((scope) => {
    if (ctx?.userId) scope.setUser({ id: ctx.userId });
    scope.setTag("route", `${ctx?.method ?? ""} ${ctx?.path ?? "<unmatched>"}`.trim());
    Sentry.captureException(exception);
  });
}
