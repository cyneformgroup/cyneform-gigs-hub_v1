import { Injectable, Logger } from "@nestjs/common";

/** Development prints each email to the API console. A real provider replaces the body of send() later. */
@Injectable()
export class MailService {
  private readonly log = new Logger("Mail");

  async send(to: string, subject: string, body: string): Promise<void> {
    this.log.log(`\n--- EMAIL to ${to} ---\nSubject: ${subject}\n${body}\n--- END EMAIL ---`);
  }
}
