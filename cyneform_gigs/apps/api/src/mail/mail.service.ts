import { Injectable, Logger } from "@nestjs/common";
import { env } from "../config/env";

/** Development prints each email to the API console. A real provider replaces the body of send() later. */
@Injectable()
export class MailService {
  private readonly log = new Logger("Mail");

  async send(to: string, subject: string, body: string): Promise<void> {
    const code = body.match(/Your code is (\d{6})/)?.[1];
    if (env.NODE_ENV === "development" && subject === "Your CyneForm sign-in code" && code) {
      console.log(`[DEV OTP] ${code} for ${to}`);
    }
    this.log.log(`\n--- EMAIL to ${to} ---\nSubject: ${subject}\n${body}\n--- END EMAIL ---`);
  }
}
