import { db, emailLogs } from "@cyneform/db";
import type { MailJob } from "@cyneform/queue";
import type { Job } from "bullmq";
import nodemailer from "nodemailer";
import { env } from "./env";

const transport = env.SMTP_HOST
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    })
  : null;

const mask = (email: string) => {
  const [local = "", domain = ""] = email.split("@");
  return `${local.slice(0, 1)}***@${domain}`;
};

async function record(
  m: MailJob,
  status: "sent" | "logged" | "failed",
  attempt: number,
  error?: string,
) {
  try {
    await db.insert(emailLogs).values({
      recipient: mask(m.to),
      subject: m.subject.slice(0, 255),
      template: m.template ?? null,
      status,
      attempt,
      error: error?.slice(0, 500) ?? null,
    });
  } catch (e) {
    console.error("[mail] could not write email_logs:", (e as Error).message);
  }
}

export async function sendMail(job: Job<MailJob>) {
  const m = job.data;
  const attempt = job.attemptsMade + 1;
  try {
    if (transport) {
      await transport.sendMail({
        from: env.MAIL_FROM,
        to: m.to,
        subject: m.subject,
        text: m.text,
        html: m.html,
      });
    } else {
      console.log(
        `\n--- EMAIL (SMTP not configured) ---\nTo: ${m.to}\nSubject: ${m.subject}\n\n${m.text}\n-----------------------------------\n`,
      );
    }
  } catch (err) {
    await record(m, "failed", attempt, (err as Error).message);
    throw err; // BullMQ retries with backoff
  }
  await record(m, transport ? "sent" : "logged", attempt);
}
