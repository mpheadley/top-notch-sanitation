const RESEND_API_KEY = process.env.RESEND_API_KEY?.trim()
const NOTIFY_EMAIL = 'topnotchrockmart@gmail.com'
const SITE_NAME = 'Top Notch Sanitation'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const { name, email, phone, service, message } = req.body || {}
  if (!name || !email) return res.status(400).json({ error: 'Name and email are required' })

  if (RESEND_API_KEY) {
    const send = (payload) => fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify(payload),
    })

    await Promise.allSettled([
      send({
        from: 'Gather Studio <noreply@matthewheadley.com>',
        to: NOTIFY_EMAIL,
        reply_to: email,
        subject: `New contact from ${name} — ${SITE_NAME}`,
        html: `<p style="font-family:sans-serif;font-size:15px;color:#222;">
          <b>Name:</b> ${name}<br>
          <b>Email:</b> <a href="mailto:${email}">${email}</a><br>
          ${phone ? `<b>Phone:</b> ${phone}<br>` : ''}
          ${service ? `<b>Service:</b> ${service}<br>` : ''}
          ${message ? `<b>Message:</b><br>${message.replace(/\n/g, '<br>')}` : ''}
        </p>`,
      }),
      send({
        from: 'Gather Studio <noreply@matthewheadley.com>',
        to: email,
        reply_to: NOTIFY_EMAIL,
        subject: `Thanks for reaching out — ${SITE_NAME}`,
        html: `<p style="font-family:sans-serif;font-size:15px;color:#222;">Hi ${name},<br><br>
          Thanks for reaching out! We received your message and will be in touch soon.<br><br>
          — ${SITE_NAME}</p>`,
      }),
    ])
  }

  res.status(200).json({ ok: true })
}
