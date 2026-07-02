import nodemailer from "nodemailer";

const smtpConfigured = () => Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD);
const brevoApiKey = () => String(process.env.BREVO_API_KEY || "").trim();
const brevoApiConfigured = () => brevoApiKey().startsWith("xkeysib-");
const isCloudflareRuntime = () => process.env.DATABASE_PROVIDER === "cloudflare-d1";

const getBaseUrl = (requestUrl) => {
  return process.env.NEXT_PUBLIC_APP_URL || new URL(requestUrl).origin;
};

const escapeHtml = (value) => {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
};

const parseSender = () => {
  const fromAddress = process.env.BREVO_FROM || process.env.SMTP_FROM || `"Boster Bost" <${process.env.SMTP_USER || "no-reply@bosterbost.local"}>`;
  const senderMatch = fromAddress.match(/^(?:"?([^"<]*)"?\s*)?<([^>]+)>$/);

  if (senderMatch) {
    return {
      formatted: fromAddress,
      sender: {
        name: senderMatch[1]?.trim() || "Boster Bost",
        email: senderMatch[2].trim(),
      },
    };
  }

  const email = fromAddress.replaceAll('"', "").trim();
  return {
    formatted: `"Boster Bost" <${email}>`,
    sender: { name: "Boster Bost", email },
  };
};

const getEmailContent = ({ name, actionUrl, type }) => {
  const safeName = escapeHtml(name);
  const safeActionUrl = escapeHtml(actionUrl);
  const isReset = type === "password-reset";
  const subject = isReset ? "Reset your Boster Bost password" : "Confirm your Boster Bost email address";
  const heading = isReset ? "Reset your Boster Bost password" : "Confirm your Boster Bost email address";
  const intro = isReset
    ? "Use this secure link to set a new password for your Boster Bost account."
    : "Confirm your email address to activate your Boster Bost account.";
  const buttonText = isReset ? "Reset Password" : "Confirm Email";
  const text = isReset
    ? `Hi ${name},\n\nReset your Boster Bost password here:\n${actionUrl}\n\nThis link expires in 1 hour. If you did not request this, you can ignore this email.`
    : `Hi ${name},\n\nConfirm your email address to activate your Boster Bost account:\n${actionUrl}\n\nIf you did not create this account, you can ignore this email.`;

  return {
    subject,
    text,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.55;color:#101828">
        <h2>${heading}</h2>
        <p>Hi ${safeName},</p>
        <p>${intro}</p>
        <p>
          <a href="${safeActionUrl}" style="display:inline-block;background:#f4c95d;color:#101828;padding:12px 18px;border-radius:8px;font-weight:700;text-decoration:none">
            ${buttonText}
          </a>
        </p>
        <p>Or copy this link into your browser:</p>
        <p>${safeActionUrl}</p>
      </div>
    `,
  };
};

const getSupportEmailContent = ({ name, subject, heading, intro, actionUrl, ticketId, message }) => {
  const safeName = escapeHtml(name || "there");
  const safeHeading = escapeHtml(heading);
  const safeIntro = escapeHtml(intro);
  const safeActionUrl = escapeHtml(actionUrl);
  const safeTicketId = escapeHtml(ticketId || "support ticket");
  const safeMessage = escapeHtml(message || "");

  return {
    subject,
    text: `Hi ${name || "there"},\n\n${intro}\n\nTicket: ${ticketId || "support ticket"}\n\n${message || ""}\n\nOpen dashboard: ${actionUrl}`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.55;color:#101828">
        <h2>${safeHeading}</h2>
        <p>Hi ${safeName},</p>
        <p>${safeIntro}</p>
        <p><strong>Ticket:</strong> ${safeTicketId}</p>
        ${safeMessage ? `<p style="padding:12px;border-left:4px solid #08786f;background:#f6f8fb">${safeMessage}</p>` : ""}
        <p>
          <a href="${safeActionUrl}" style="display:inline-block;background:#f4c95d;color:#101828;padding:12px 18px;border-radius:8px;font-weight:700;text-decoration:none">
            Open Dashboard
          </a>
        </p>
      </div>
    `,
  };
};

export const buildVerificationUrl = (requestUrl, token) => {
  return `${getBaseUrl(requestUrl).replace(/\/$/, "")}/verify-email?token=${encodeURIComponent(token)}`;
};

export const buildPasswordResetUrl = (requestUrl, token) => {
  return `${getBaseUrl(requestUrl).replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(token)}`;
};

const sendEmailMessage = async ({ to, name, subject, text, html }) => {
  const { formatted, sender } = parseSender();

  if (brevoApiConfigured()) {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        accept: "application/json",
        "api-key": brevoApiKey(),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        subject,
        textContent: text,
        htmlContent: html,
        sender,
        to: [{ email: to, name }],
      }),
    });

    if (!response.ok) {
      const details = await response.text().catch(() => "");
      throw new Error(`Brevo email failed (${response.status}). ${details}`);
    }

    return { sent: true, provider: "brevo-api" };
  }

  if (isCloudflareRuntime()) {
    return {
      sent: false,
      reason: "Cloud email requires a Brevo API key that starts with xkeysib-. SMTP keys start with xsmtpsib- and can trigger IP confirmation.",
    };
  }

  if (!smtpConfigured()) {
    return {
      sent: false,
      reason: "Email sender is not configured.",
    };
  }

  const port = Number(process.env.SMTP_PORT || 587);
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });

  await transporter.verify();
  await transporter.sendMail({
    from: formatted,
    to,
    subject,
    text,
    html,
  });

  return { sent: true, provider: "smtp" };
};

const sendTransactionalEmail = async ({ to, name, actionUrl, type }) => {
  const content = getEmailContent({ name, actionUrl, type });
  return sendEmailMessage({ to, name, ...content });
};

export const sendVerificationEmail = async ({ to, name, verificationUrl }) => {
  return sendTransactionalEmail({ to, name, actionUrl: verificationUrl, type: "verification" });
};

export const sendPasswordResetEmail = async ({ to, name, resetUrl }) => {
  return sendTransactionalEmail({ to, name, actionUrl: resetUrl, type: "password-reset" });
};

export const buildDashboardUrl = (requestUrl, path = "/dashboard/support") => {
  return `${getBaseUrl(requestUrl).replace(/\/$/, "")}${path}`;
};

export const sendSupportTicketReceivedEmail = async ({ to, name, dashboardUrl, ticket }) => {
  const content = getSupportEmailContent({
    name,
    actionUrl: dashboardUrl,
    ticketId: ticket.ticketId,
    subject: `We received your support ticket ${ticket.ticketId}`,
    heading: "Support ticket received",
    intro: "Your support request has been received by Boster Bost. Our team will review it and reply in your dashboard.",
    message: ticket.subject,
  });
  return sendEmailMessage({ to, name, ...content });
};

export const sendSupportTicketUpdatedEmail = async ({ to, name, dashboardUrl, ticket, reply }) => {
  const content = getSupportEmailContent({
    name,
    actionUrl: dashboardUrl,
    ticketId: ticket.ticketId,
    subject: `Your Boster Bost ticket ${ticket.ticketId} was updated`,
    heading: "Support ticket updated",
    intro: "An administrator replied to your support ticket. Please open your dashboard to continue the conversation.",
    message: reply,
  });
  return sendEmailMessage({ to, name, ...content });
};

export const sendSupportCustomerReplyEmail = async ({ to, name, dashboardUrl, ticket, reply }) => {
  const content = getSupportEmailContent({
    name,
    actionUrl: dashboardUrl,
    ticketId: ticket.ticketId,
    subject: `Customer replied to ${ticket.ticketId}`,
    heading: "Customer support reply",
    intro: `${ticket.customerName || "A customer"} replied to a support ticket in the admin portal.`,
    message: reply,
  });
  return sendEmailMessage({ to, name, ...content });
};
