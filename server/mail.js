// Outbound email. One message shape, two providers behind it, and nothing here is allowed to take a
// request down.
//
// Why an API and not SMTP: Render's free plan blocks outbound 25, 465 and 587 (and 25 stays blocked on
// paid, since it runs on EC2), so a reset mail sent over SMTP would simply never leave the box.
//
//   MAIL_PROVIDER=brevo   needs no domain: one sender address, verified once in the Brevo dashboard by
//                         clicking a code they mail to it. MAIL_FROM is that address (your own inbox).
//   MAIL_PROVIDER=resend  needs a domain you control, verified with DNS records.
//
// A send that fails is logged and reported as `false`; the caller answers the user exactly as it would
// have otherwise, because "that address has no account" is not something a stranger may ask about.
const TIMEOUT_MS = 10_000;

const PROVIDERS = {
  brevo: {
    url: 'https://api.brevo.com/v3/smtp/email',
    headers: (key) => ({ 'api-key': key, 'content-type': 'application/json', accept: 'application/json' }),
    body: (from, { to, subject, text }) => ({
      sender: { email: from, name: process.env.MAIL_FROM_NAME ?? 'Auralis' },
      to: [{ email: to }],
      subject,
      textContent: text,
    }),
  },
  resend: {
    url: 'https://api.resend.com/emails',
    headers: (key) => ({ authorization: `Bearer ${key}`, 'content-type': 'application/json' }),
    body: (from, { to, subject, text }) => ({
      from: `${process.env.MAIL_FROM_NAME ?? 'Auralis'} <${from}>`,
      to: [to],
      subject,
      text,
    }),
  },
};

const provider = String(process.env.MAIL_PROVIDER ?? 'brevo').trim().toLowerCase();
// Unset or unknown: no provider, so a send is reported as not configured rather than guessed at.
const impl = PROVIDERS[provider] ?? null;
const key = String(process.env.MAIL_API_KEY ?? '').trim();
const from = String(process.env.MAIL_FROM ?? '').trim();
// CI and local development: print the message instead of sending it, so the flow can be exercised end
// to end without a provider account and without mailing anybody.
const dryRun = process.env.MAIL_DRY_RUN === '1';

export const mailConfigured = () => dryRun || !!(impl && key && from);

// What a reset mail says. The link carries the token in the fragment, which the browser never sends to
// the server, so it stays out of access logs and Referer headers.
export function resetMail(link, minutes) {
  return {
    subject: 'Reset your Auralis password',
    text: [
      'Someone asked to reset the password for your Auralis account.',
      '',
      `Open this link to choose a new one: ${link}`,
      '',
      `The link works once and expires in ${minutes} minutes. If this was not you, nothing has changed`,
      'and you can ignore this message.',
    ].join('\n'),
  };
}

// Resolves true when the provider accepted the message. Never throws.
export async function sendMail({ to, subject, text }) {
  const message = { to, subject, text };
  if (dryRun) {
    console.log('[mail] dry run', JSON.stringify(message));
    return true;
  }
  if (!impl || !key || !from) {
    console.error(`[mail] not configured (provider=${provider || 'unset'}): would have sent "${subject}" to ${to}`);
    return false;
  }
  try {
    const res = await fetch(impl.url, {
      method: 'POST',
      headers: impl.headers(key),
      body: JSON.stringify(impl.body(from, message)),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.ok) return true;
    // A quota error or a rejected sender is worth reading: the body says which. Never the key.
    const detail = await res.text().catch(() => '');
    console.error(`[mail] ${provider} refused ${res.status}: ${detail.slice(0, 300)}`);
    if (res.status === 401 || res.status === 403) console.error('[mail] check MAIL_API_KEY and that MAIL_FROM is a verified sender/domain');
    return false;
  } catch (err) {
    console.error('[mail] send failed', err?.message ?? err);
    return false;
  }
}
