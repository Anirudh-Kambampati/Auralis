// Email through Brevo's HTTP API (free plan: 300 emails a day). It has to be HTTP: Render's free plan blocks the
// SMTP ports. Set BREVO_API_KEY and MAIL_FROM (a sender address verified in Brevo) to turn it on.
export const mailOn = () => !!(process.env.BREVO_API_KEY && process.env.MAIL_FROM);

export async function sendMail(to, subject, text, html) {
  if (!mailOn()) {
    // Local development: print the email so the link can be clicked from the terminal. Never on Render, where
    // logs could hand out someone's reset link.
    if (process.env.RENDER) console.warn('mail is off (BREVO_API_KEY / MAIL_FROM not set): an email was not sent');
    else console.log(`\n[mail is off] to ${to}: ${subject}\n${text}\n`);
    return;
  }
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': process.env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ sender: { name: 'Auralis', email: process.env.MAIL_FROM }, to: [{ email: to }], subject, textContent: text, htmlContent: html }),
  });
  if (!res.ok) throw new Error(`Brevo said ${res.status}: ${await res.text()}`);
}
