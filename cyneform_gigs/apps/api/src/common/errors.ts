import type { ApiErrorBody } from "@cyneform/types";
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from "@nestjs/common";
import type { Response } from "express";
import { ZodValidationException } from "nestjs-zod";

export class AppError extends HttpException {
  constructor(
    public readonly code: string,
    message: string,
    status: number,
  ) {
    super(message, status);
  }
}
export const unauthorized = (code = "UNAUTHORIZED", message = "Please sign in again.") =>
  new AppError(code, message, 401);
export const forbidden = (code = "FORBIDDEN", message = "You do not have access to this.") =>
  new AppError(code, message, 403);
export const notFound = (message = "Not found.") => new AppError("NOT_FOUND", message, 404);
export const conflict = (code: string, message: string) => new AppError(code, message, 409);
export const badRequest = (code: string, message: string) => new AppError(code, message, 400);

/** Every failure leaves the API as { error: { code, message, fields? } }. */
@Catch()
export class ErrorFilter implements ExceptionFilter {
  private readonly log = new Logger("Errors");

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    let status = 500;
    let body: ApiErrorBody = {
      error: { code: "INTERNAL_ERROR", message: "Something went wrong." },
    };

    if (exception instanceof ZodValidationException) {
      const fields: Record<string, string> = {};
      for (const issue of (
        exception.getZodError() as {
          issues: { path: PropertyKey[]; message: string }[];
        }
      ).issues) {
        fields[issue.path.map(String).join(".") || "_"] ??= issue.message;
      }
      status = 400;
      body = {
        error: {
          code: "VALIDATION_FAILED",
          message: "Please check the highlighted fields.",
          fields,
        },
      };
    } else if (exception instanceof AppError) {
      status = exception.getStatus();
      body = { error: { code: exception.code, message: exception.message } };
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const code = status === 429 ? "RATE_LIMITED" : status === 404 ? "NOT_FOUND" : "HTTP_ERROR";
      body = {
        error: {
          code,
          message: status === 429 ? "Please wait a moment and try again." : exception.message,
        },
      };
    } else {
      this.log.error(
        exception instanceof Error ? (exception.stack ?? exception.message) : String(exception),
      );
    }
    res.status(status).json(body);
  }
}
