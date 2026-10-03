/**
 * Mail transport. No provider is configured yet, so messages are logged and kept in an in-memory outbox
 * (which the test suite reads). Plug in Resend/SES/SMTP here without touching callers.
 */
export type Mail = { to: string; subject: string; text: string; html?: string };

export const mailOutbox: Mail[] = [];

export async function sendMail(mail: Mail): Promise<void> {
  mailOutbox.push(mail);
  if (mailOutbox.length > 100) mailOutbox.shift();
  if (process.env.NODE_ENV !== "test") {
    console.log(`[mail] to=${mail.to} subject="${mail.subject}"\n${mail.text}`);
  }
}

export function appUrl(path: string): string {
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}${path}`;
}
