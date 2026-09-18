import { brand } from '@/config/brand';
import type { EmailMessage } from './index';

function layout(heading: string, bodyHtml: string, cta?: { label: string; url: string }): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(heading)}</title></head>
<body style="margin:0;padding:0;background:#F7F9F7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1F2A24;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F9F7;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:20px;overflow:hidden;border:1px solid #E3E8E4;">
        <tr><td style="background:${brand.themeColor};padding:24px 28px;">
          <span style="color:#FFFFFF;font-size:20px;font-weight:700;letter-spacing:-0.02em;">${escapeHtml(brand.name)}</span>
          <span style="color:#A7D9BF;font-size:13px;margin-left:10px;">${escapeHtml(brand.tagline)}</span>
        </td></tr>
        <tr><td style="padding:28px;">
          <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;">${escapeHtml(heading)}</h1>
          ${bodyHtml}
          ${
            cta
              ? `<p style="margin:24px 0;"><a href="${escapeAttr(cta.url)}" style="display:inline-block;background:#1F9D55;color:#FFFFFF;text-decoration:none;padding:13px 22px;border-radius:12px;font-weight:600;">${escapeHtml(cta.label)}</a></p>
                 <p style="margin:0;font-size:13px;color:#5A6B62;">If the button does not work, copy this link into your browser:<br><span style="word-break:break-all;color:#1F6B47;">${escapeHtml(cta.url)}</span></p>`
              : ''
          }
        </td></tr>
        <tr><td style="padding:18px 28px;border-top:1px solid #E3E8E4;font-size:12px;color:#5A6B62;">
          You are receiving this because someone used this address to sign up for ${escapeHtml(brand.name)}.
          Questions? Reply to this e-mail or contact ${escapeHtml(brand.supportEmail)}.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export function verificationEmail(to: string, firstName: string, url: string): EmailMessage {
  return {
    to,
    subject: `Confirm your e-mail address — ${brand.name}`,
    html: layout(
      `Welcome, ${escapeHtml(firstName)}!`,
      `<p style="margin:0;font-size:15px;line-height:1.6;color:#3B4A42;">Confirm your e-mail address so we can keep your workspace secure and send you export notifications.</p>`,
      { label: 'Confirm my e-mail', url },
    ),
    text: `Welcome to ${brand.name}, ${firstName}!\n\nConfirm your e-mail address: ${url}\n\nThis link expires in 24 hours.`,
  };
}

export function passwordResetEmail(to: string, firstName: string, url: string): EmailMessage {
  return {
    to,
    subject: `Reset your ${brand.name} password`,
    html: layout(
      'Reset your password',
      `<p style="margin:0;font-size:15px;line-height:1.6;color:#3B4A42;">Hi ${escapeHtml(firstName)}, we received a request to reset your password. This link expires in one hour and can be used once.</p>
       <p style="margin:12px 0 0;font-size:15px;line-height:1.6;color:#3B4A42;">If you did not request this, you can safely ignore this e-mail — your password will not change.</p>`,
      { label: 'Choose a new password', url },
    ),
    text: `Hi ${firstName},\n\nReset your ${brand.name} password: ${url}\n\nThis link expires in one hour. If you did not request it, ignore this e-mail.`,
  };
}

export function passwordChangedEmail(to: string, firstName: string): EmailMessage {
  return {
    to,
    subject: `Your ${brand.name} password was changed`,
    html: layout(
      'Your password was changed',
      `<p style="margin:0;font-size:15px;line-height:1.6;color:#3B4A42;">Hi ${escapeHtml(firstName)}, the password on your ${escapeHtml(brand.name)} account was just changed and every other signed-in device was signed out.</p>
       <p style="margin:12px 0 0;font-size:15px;line-height:1.6;color:#3B4A42;">If this was not you, reset your password immediately and contact ${escapeHtml(brand.supportEmail)}.</p>`,
    ),
    text: `Hi ${firstName},\n\nYour ${brand.name} password was changed and other devices were signed out. If this was not you, reset your password and contact ${brand.supportEmail}.`,
  };
}

export function exportReadyEmail(to: string, firstName: string, url: string, fileCount: number): EmailMessage {
  return {
    to,
    subject: `Your export is ready — ${brand.name}`,
    html: layout(
      'Your export is ready',
      `<p style="margin:0;font-size:15px;line-height:1.6;color:#3B4A42;">Hi ${escapeHtml(firstName)}, ${fileCount} ${fileCount === 1 ? 'slip is' : 'slips are'} packed and ready for your accountant.</p>`,
      { label: 'Open my exports', url },
    ),
    text: `Hi ${firstName},\n\nYour export of ${fileCount} slip(s) is ready: ${url}`,
  };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) =>
    char === '&' ? '&amp;' : char === '<' ? '&lt;' : char === '>' ? '&gt;' : char === '"' ? '&quot;' : '&#39;',
  );
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/`/g, '&#96;');
}
