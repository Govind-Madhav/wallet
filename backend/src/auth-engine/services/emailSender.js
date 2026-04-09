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

const resolveFromEmail = () => {
    const configured = (process.env.EMAIL_FROM || '').trim();
    const smtpUser = (process.env.SMTP_USER || '').trim();

    if (!configured || configured.endsWith('@wallet.local')) {
        return smtpUser || 'no-reply@wallet.local';
    }

    return configured;
};

const sendEmailVerification = async ({ toEmail, rawToken, expiresAt }) => {
    if (!toEmail || !rawToken) return;

    const appBaseUrl = (process.env.APP_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
    const fromEmail = resolveFromEmail();
    const verifyUrl = `${appBaseUrl}/verify-email?token=${encodeURIComponent(rawToken)}`;

    const mailer = getTransporter();

    if (!mailer) {
        console.log('[Email Verification] SMTP not configured. Verification URL:', verifyUrl);
        return;
    }

        const expiryIso = expiresAt instanceof Date ? expiresAt.toISOString() : new Date(expiresAt).toISOString();

        const textBody = [
            'DBT Wallet - Your Verification Code',
                '',
                'Hello,',
                '',
            'Thanks for signing up. Use the verification code below to activate your account.',
            '',
            `Verification code: ${rawToken}`,
                '',
                `Expires at (UTC): ${expiryIso}`,
                '',
                'If you did not create this account, please ignore this email.',
        ].join('\n');

        const htmlBody = `
<!doctype html>
<html>
    <body style="margin:0;padding:0;background:#f3f6fb;font-family:Segoe UI,Arial,sans-serif;color:#1e293b;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f6fb;padding:24px 12px;">
            <tr>
                <td align="center">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">
                        <tr>
                            <td style="padding:22px 24px;background:linear-gradient(90deg,#0f172a,#1d4ed8);color:#ffffff;">
                                <p style="margin:0;font-size:12px;letter-spacing:.12em;text-transform:uppercase;opacity:.9;">DBT Wallet</p>
                                <h1 style="margin:6px 0 0 0;font-size:22px;line-height:1.3;">Your verification code</h1>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding:24px;">
                                <p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;">Hello,</p>
                                <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;">Thanks for signing up. Use the code below in the app to activate your account.</p>
                                <div style="margin:22px 0;padding:18px 20px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:14px;text-align:center;">
                                    <div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#1d4ed8;margin-bottom:8px;">Verification Code</div>
                                    <div style="font-size:34px;font-weight:800;letter-spacing:.3em;color:#0f172a;">${rawToken}</div>
                                </div>
                                <p style="margin:0 0 16px 0;font-size:14px;color:#475569;">You can enter this 6-digit code in the verification screen. It expires at <strong>${expiryIso}</strong> (UTC).</p>
                                <p style="margin:0 0 8px 0;font-size:13px;color:#475569;">This link expires at <strong>${expiryIso}</strong> (UTC).</p>
                                <p style="margin:0 0 16px 0;font-size:13px;color:#475569;">If you prefer to verify by link, copy and paste this URL into your browser:</p>
                                <p style="margin:0 0 18px 0;word-break:break-all;"><a href="${verifyUrl}" style="color:#1d4ed8;text-decoration:none;">${verifyUrl}</a></p>
                                <div style="margin-top:20px;padding:12px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;font-size:12px;color:#64748b;">
                                    Security note: If you did not request this email, you can safely ignore it.
                                </div>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
</html>`;

    await mailer.sendMail({
        from: fromEmail,
        to: toEmail,
        subject: 'DBT Wallet: Your verification code',
        text: textBody,
        html: htmlBody
    });

    console.log('[Email Verification] Email sent to:', toEmail);
};

const sendPasswordResetEmail = async ({ toEmail, rawToken, expiresAt }) => {
    if (!toEmail || !rawToken) return;

    const appBaseUrl = (process.env.APP_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
    const fromEmail = resolveFromEmail();
    const resetUrl = `${appBaseUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;
    const mailer = getTransporter();

    if (!mailer) {
        console.log('[Password Reset] SMTP not configured. Reset code:', rawToken);
        console.log('[Password Reset] Reset URL:', resetUrl);
        return;
    }

    const expiryIso = expiresAt instanceof Date ? expiresAt.toISOString() : new Date(expiresAt).toISOString();

    const textBody = [
        'DBT Wallet - Password Recovery Code',
        '',
        'Hello,',
        '',
        'Use the recovery code below to reset your password.',
        '',
        `Recovery code: ${rawToken}`,
        '',
        `Expires at (UTC): ${expiryIso}`,
        '',
        `Reset link: ${resetUrl}`,
        '',
        'If you did not request a password reset, you can ignore this email.'
    ].join('\n');

    const htmlBody = `
<!doctype html>
<html>
    <body style="margin:0;padding:0;background:#f3f6fb;font-family:Segoe UI,Arial,sans-serif;color:#1e293b;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f6fb;padding:24px 12px;">
            <tr>
                <td align="center">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">
                        <tr>
                            <td style="padding:22px 24px;background:linear-gradient(90deg,#111827,#7c3aed);color:#ffffff;">
                                <p style="margin:0;font-size:12px;letter-spacing:.12em;text-transform:uppercase;opacity:.9;">DBT Wallet</p>
                                <h1 style="margin:6px 0 0 0;font-size:22px;line-height:1.3;">Password recovery code</h1>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding:24px;">
                                <p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;">Hello,</p>
                                <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;">Use the code below to reset your password.</p>
                                <div style="margin:22px 0;padding:18px 20px;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:14px;text-align:center;">
                                    <div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#6d28d9;margin-bottom:8px;">Recovery Code</div>
                                    <div style="font-size:34px;font-weight:800;letter-spacing:.28em;color:#111827;">${rawToken}</div>
                                </div>
                                <p style="margin:0 0 16px 0;font-size:14px;color:#475569;">This code expires at <strong>${expiryIso}</strong> (UTC).</p>
                                <p style="margin:0 0 16px 0;font-size:13px;color:#475569;">If you prefer to continue by link, copy and paste this URL into your browser:</p>
                                <p style="margin:0 0 18px 0;word-break:break-all;"><a href="${resetUrl}" style="color:#7c3aed;text-decoration:none;">${resetUrl}</a></p>
                                <div style="margin-top:20px;padding:12px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;font-size:12px;color:#64748b;">
                                    Security note: If you did not request this reset, ignore this message.
                                </div>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
</html>`;

    await mailer.sendMail({
        from: fromEmail,
        to: toEmail,
        subject: 'DBT Wallet: Password recovery code',
        text: textBody,
        html: htmlBody
    });

    console.log('[Password Reset] Recovery email sent to:', toEmail);
};

module.exports = {
    sendEmailVerification,
    sendPasswordResetEmail
};
