import { createQueue, type MailJob, QUEUES } from "@cyneform/queue";
import { Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import { env } from "../config/env";
import { type Rendered, type TemplateData, type TemplateName, templates } from "./templates";

@Injectable()
export class MailService implements OnModuleDestroy {
  private readonly log = new Logger(MailService.name);
  private readonly queue = createQueue<MailJob>(QUEUES.mail, env.REDIS_URL);

  async send(
    to: string,
    subject: string,
    text: string,
    extra: Pick<MailJob, "html" | "template"> = {},
  ) {
    try {
      await this.queue.add(
        "send",
        { to, subject, text, ...extra },
        {
          attempts: 5,
          backoff: { type: "exponential", delay: 5_000 },
          removeOnComplete: 1_000,
          removeOnFail: 5_000,
        },
      );
    } catch (err) {
      this.log.error(`Could not queue email to ${to}: ${(err as Error).message}`);
      // Development only: if Redis is down, still show the email (OTP codes etc.).
      if (process.env.NODE_ENV !== "production")
        this.log.warn(`[DEV FALLBACK]\nTo: ${to}\nSubject: ${subject}\n\n${text}`);
    }
  }

  sendTemplate<N extends TemplateName>(to: string, name: N, data: TemplateData<N>) {
    const m = (templates[name] as (d: TemplateData<N>) => Rendered)(data);
    return this.send(to, m.subject, m.text, { html: m.html, template: name });
  }

  onModuleDestroy() {
    return this.queue.close();
  }
}
