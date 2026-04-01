const nodemailer = require('nodemailer');

let transporter = null;

const parseBoolean = (value, fallback = false) => {
    if (typeof value !== 'string') return fallback;
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
    return fallback;
};

const getTransporter = () => {
    if (transporter) return transporter;

    const host = process.env.SMTP_HOST;
    const port = Number.parseInt(process.env.SMTP_PORT, 10) || 587;
    const secure = parseBoolean(process.env.SMTP_SECURE, false);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host || !user || !pass) {
        return null;
    }

    transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user, pass }
    });

    return transporter;
};

const sendEmailVerification = async ({ toEmail, rawToken, expiresAt }) => {
    if (!toEmail || !rawToken) return;

    const appBaseUrl = (process.env.APP_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
    const fromEmail = process.env.EMAIL_FROM || 'no-reply@wallet.local';
    const verifyUrl = `${appBaseUrl}/verify-email?token=${encodeURIComponent(rawToken)}`;

    const mailer = getTransporter();

    if (!mailer) {
        console.log('[Email Verification] SMTP not configured. Verification URL:', verifyUrl);
        return;
    }

    await mailer.sendMail({
        from: fromEmail,
        to: toEmail,
        subject: 'Verify your email',
        text: `Verify your email by opening this link: ${verifyUrl}\nThis link expires at: ${expiresAt.toISOString()}`,
        html: `<p>Verify your email by clicking this link:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p><p>This link expires at: ${expiresAt.toISOString()}</p>`
    });
};

module.exports = {
    sendEmailVerification
};
