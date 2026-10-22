/**
 * Outgoing messages. Every message is written to the outbox table first (so the admin can always
 * see what went out), then delivered through whichever provider is configured:
 *
 *   WhatsApp Cloud API  WHATSAPP_TOKEN + WHATSAPP_PHONE_NUMBER_ID
 *   Twilio SMS          TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM
 *
 * Login codes always go by SMS. Other messages prefer WhatsApp and fall back to SMS.
 * With no provider configured the message is only logged, which is fine for local development.
 *
 * Notes for India: commercial SMS needs DLT registration of your sender ID and templates, and
 * WhatsApp messages sent outside a 24-hour customer window must use pre-approved templates.
 * Both providers below send plain text; switch to templates before launch.
 */
export function createNotifier({ db, config, fetchImpl = fetch, log = console }) {
  const insert = db.prepare('INSERT INTO outbox (to_phone, channel, body, status) VALUES (?,?,?,?)');
  const update = db.prepare('UPDATE outbox SET status = ?, error = ? WHERE id = ?');

  const hasSms = !!(config.twilioSid && config.twilioToken && config.twilioFrom);
  const hasWhatsapp = !!(config.whatsappToken && config.whatsappPhoneId);

  async function sendSms(to, body) {
    const auth = Buffer.from(`${config.twilioSid}:${config.twilioToken}`).toString('base64');
    const res = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${config.twilioSid}/Messages.json`, {
      method: 'POST',
      headers: { authorization: `Basic ${auth}`, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: to, From: config.twilioFrom, Body: body }).toString(),
    });
    if (!res.ok) throw new Error(`Twilio returned ${res.status}`);
  }

  async function sendWhatsapp(to, body) {
    const res = await fetchImpl(`https://graph.facebook.com/${config.whatsappApiVersion}/${config.whatsappPhoneId}/messages`, {
      method: 'POST',
      headers: { authorization: `Bearer ${config.whatsappToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: to.replace(/^\+/, ''), type: 'text', text: { body } }),
    });
    if (!res.ok) throw new Error(`WhatsApp returned ${res.status}`);
  }

  /** Queue and send a message. Resolves when delivery finished or failed; never throws. */
  return async function notify(phone, body, channel = 'whatsapp') {
    const route = channel === 'sms' ? (hasSms ? 'sms' : null) : hasWhatsapp ? 'whatsapp' : hasSms ? 'sms' : null;
    const row = insert.run(phone, route || channel, body, route ? 'queued' : 'logged');
    const id = Number(row.lastInsertRowid);
    if (!route) return { id, status: 'logged' };
    try {
      await (route === 'sms' ? sendSms(phone, body) : sendWhatsapp(phone, body));
      update.run('sent', '', id);
      return { id, status: 'sent' };
    } catch (e) {
      update.run('failed', String(e.message || e).slice(0, 300), id);
      log.error?.(`Message ${id} to ${phone} failed: ${e.message}`);
      return { id, status: 'failed' };
    }
  };
}
