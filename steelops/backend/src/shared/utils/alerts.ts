import nodemailer, { Transporter } from 'nodemailer';

export interface AlertPayload {
  type: 'info' | 'success' | 'warning' | 'danger';
  recipient_email: string;
  subject: string;
  body: string;
  link?: string;
}

let transporter: Transporter | null = null;
let warnedNoSmtp = false;

function getTransporter(): Transporter | null {
  if (transporter) return transporter;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    if (!warnedNoSmtp) {
      console.warn('[Alerts] SMTP_HOST/SMTP_USER/SMTP_PASS not set — alerts will be logged, not emailed. See .env.example.');
      warnedNoSmtp = true;
    }
    return null;
  }
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT ? parseInt(SMTP_PORT) : 587,
    secure: SMTP_PORT === '465',
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return transporter;
}

const TYPE_LABEL: Record<AlertPayload['type'], string> = {
  info: 'Info', success: 'Success', warning: 'Warning', danger: 'Alert',
};

export async function sendAlert(alert: AlertPayload): Promise<void> {
  if (!alert.recipient_email) {
    console.warn('[Alerts] sendAlert called with no recipient_email — skipping', alert.subject);
    return;
  }

  const t = getTransporter();
  if (!t) {
    // Dev / not-yet-configured fallback: still visible in logs so nothing is silently dropped.
    console.log(`[Alert][${alert.type.toUpperCase()}] -> ${alert.recipient_email}: ${alert.subject}`);
    return;
  }

  const html = `
    <p><strong>${TYPE_LABEL[alert.type]}</strong></p>
    <p>${alert.body}</p>
    ${alert.link ? `<p><a href="${alert.link}">View in SteelOps</a></p>` : ''}
  `;

  try {
    await t.sendMail({
      from: process.env.ALERT_FROM_EMAIL || 'alerts@steelops.local',
      to: alert.recipient_email,
      subject: `[SteelOps] ${alert.subject}`,
      text: alert.body,
      html,
    });
    console.log(`[Alert][SENT][${alert.type.toUpperCase()}] -> ${alert.recipient_email}: ${alert.subject}`);
  } catch (err: any) {
    // Never let an alert failure take down the caller (event handler / route).
    console.error(`[Alert][FAILED] -> ${alert.recipient_email}: ${alert.subject} -`, err.message);
  }
}
