export type Rendered = { subject: string; text: string; html: string };

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );

const build = (subject: string, lines: string[]): Rendered => ({
  subject,
  text: `${lines.join("\n\n")}\n\nCyneForm Group`,
  html: `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:Arial,sans-serif;color:#1f2937"><div style="max-width:520px;margin:24px auto;background:#fff;border-radius:8px;padding:28px"><h2 style="margin:0 0 16px;font-size:18px">${esc(subject)}</h2>${lines
    .map((l) => `<p style="margin:0 0 12px;line-height:1.5">${esc(l)}</p>`)
    .join(
      "",
    )}<p style="margin:20px 0 0;font-size:12px;color:#6b7280">CyneForm Group</p></div></body></html>`,
});

export const templates = {
  otp: (d: { code: string; minutes: number }) =>
    build("Your CyneForm Group Login OTP", [
      `Your one-time verification code is: ${d.code}`,
      `This code expires in ${d.minutes} minutes. If you did not try to sign in, ignore this email.`,
    ]),

  status_changed: (d: {
    name: string;
    status: string;
    reason: string;
    deactivationType?: string | null;
    whatsapp: string;
  }) => {
    const body: Record<string, string[]> = {
      frozen: [
        `Your account is under management review (${d.reason}). You cannot sign in until it is lifted.`,
        `Contact us on WhatsApp ${d.whatsapp}.`,
      ],
      on_leave: [
        "Your account is temporarily frozen as you are on official leave.",
        "It will be reactivated when your leave ends.",
      ],
      deactivated:
        d.deactivationType === "permanent"
          ? ["Your account has been deactivated permanently."]
          : ["Your account has been deactivated. Management can reactivate it."],
      active: ["Your account has been reactivated. You can sign in again."],
    };
    return build("Your CyneForm Group account status changed", [
      `Dear ${d.name},`,
      ...(body[d.status] ?? [`Your account status is now ${d.status}.`]),
    ]);
  },

  account_removed: (d: { name: string }) =>
    build("Your CyneForm Group account has been removed", [
      `Dear ${d.name},`,
      "Your account has been removed and you no longer have access.",
    ]),
};

export type TemplateName = keyof typeof templates;
export type TemplateData<N extends TemplateName> = Parameters<(typeof templates)[N]>[0];
