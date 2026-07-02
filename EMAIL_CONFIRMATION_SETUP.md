# Email Confirmation Setup

The app can send confirmation emails through Brevo API or SMTP. Brevo API is preferred because it avoids SMTP login issues.

## Recommended: Brevo API

The official Brevo SDK is already installed:

```bash
pnpm add @getbrevo/brevo
```

In Brevo, go to `SMTP & API > API Keys`, create an API key, then add this to `.env.local`:

```env
NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000
BREVO_API_KEY=your-brevo-api-key
BREVO_FROM="Boster Bost <your-verified-sender-email>"
```

The sender email in `BREVO_FROM` must be verified in Brevo Senders.

## SMTP Fallback

The app can also send through SMTP when these `.env.local` values are filled:

```env
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM="Boster Bost <your-sender-email>"
```

After changing `.env.local`, restart the Next.js server.

## Recommended Free Option: Brevo

Brevo has a free plan and supports transactional email through SMTP/API. Their pricing page says the free plan needs no credit card and can send up to 300 emails per day after approval. Brevo also states that transactional messages are available through SMTP relay and API.

1. Create a free Brevo account: `https://www.brevo.com/pricing/`
2. In Brevo, go to Transactional > Settings > SMTP & API.
3. Copy your SMTP server/login/API key.
4. Set `.env.local` like this:

```env
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=your-brevo-smtp-login
SMTP_PASSWORD=your-brevo-smtp-key
SMTP_FROM="Boster Bost <your-verified-sender-email>"
```

## Free Developer Option: Resend

Resend has a free plan with 3,000 emails per month and 100 emails per day. Their SMTP docs list:

```env
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_USER=resend
SMTP_PASSWORD=your-resend-api-key
SMTP_FROM="Boster Bost <onboarding@your-verified-domain.com>"
```

Resend requires an API key and a verified domain before sending to real customers.

## Simple Personal Option: Gmail

Gmail can work for testing if your Google account has 2-Step Verification and you create an App Password.

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-16-character-app-password
SMTP_FROM="Boster Bost <your-email@gmail.com>"
```

Gmail is okay for testing, but a transactional sender like Brevo or Resend is better for customer delivery.

## How To Test

1. Fill SMTP values in `.env.local`.
2. Restart the server.
3. Register a new account from `/signup`.
4. The response should say: `Confirmation email sent. Please check your inbox.`
5. The user must click the email link before login works.

Password reset emails use the same Brevo sender. Users can request a reset from the login form.
