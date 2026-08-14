// Templates rendered locally for providers without server-side templating (Brevo) — Mailgun uses its own dashboard templates instead.
import { MailVariables } from './mail-provider.interface';

const BRAND_GREEN = '#1FA855';
const LOGO_URL = 'https://i-one-sports.com/favicon.png';
const FONT_STACK = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const TEXT_PRIMARY = '#16181A';
const TEXT_SECONDARY = '#6B7280';
const BORDER = '#EAECEB';
const SURFACE = '#F6F7F6';
const PAGE_BG = '#F1F3F2';

export interface RenderedTemplate {
  subject: string;
  html: string;
  text: string;
}

// Shared header/footer chrome; uses tables since that's the only layout Outlook renders reliably.
function renderLayout(bodyHtml: string): string {
  return `
<!DOCTYPE html>
<html>
  <body style="margin:0; padding:0; background-color:${PAGE_BG}; font-family:${FONT_STACK};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${PAGE_BG}; padding:40px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px; width:100%; background-color:#ffffff; border:1px solid ${BORDER}; border-radius:16px; overflow:hidden;">
            <tr>
              <td style="height:4px; line-height:4px; font-size:0; background-color:${BRAND_GREEN};">&nbsp;</td>
            </tr>
            <tr>
              <td align="center" style="padding:32px 24px 8px;">
                <img
                  src="${LOGO_URL}"
                  alt="I-One"
                  width="44"
                  height="44"
                  style="display:block; width:44px; height:44px; border-radius:11px;"
                />
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px 36px; color:${TEXT_PRIMARY}; font-size:15px; line-height:1.65;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:18px 32px; border-top:1px solid ${BORDER}; color:${TEXT_SECONDARY}; font-size:12px; text-align:center;">
                &copy; ${new Date().getFullYear()} I-One Sports &middot; This is an automated message, please don't reply.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`.trim();
}

// Shared by every OTP-style template (verification, password reset) so the code box only exists once.
function otpBody(headline: string, description: string, otp: string, expiresInMinutes: string): string {
  return `
    <h1 style="margin:0 0 12px; font-size:20px; line-height:1.3; font-weight:700; color:${TEXT_PRIMARY}; text-align:center;">${headline}</h1>
    <p style="margin:0 0 28px; color:${TEXT_SECONDARY}; text-align:center;">${description}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" style="background-color:${SURFACE}; border:1px solid ${BORDER}; border-radius:10px;">
            <tr>
              <td style="padding:16px 36px; font-size:30px; font-weight:700; letter-spacing:10px; color:${BRAND_GREEN}; text-align:center;">
                ${otp}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    <p style="margin:0; color:${TEXT_SECONDARY}; font-size:13px; text-align:center;">Expires in ${expiresInMinutes} minutes. Didn't request this? You can safely ignore this email.</p>
  `;
}

function emailVerificationTemplate(vars: MailVariables): RenderedTemplate {
  const otp = String(vars.otp ?? vars.code ?? '');
  const expiresInMinutes = String(vars.expiresInMinutes ?? 10);

  return {
    subject: 'Verify your email',
    html: renderLayout(otpBody('Verify your email', "Enter this code to confirm it's really you.", otp, expiresInMinutes)),
    text: `Your verification code is ${otp}. It expires in ${expiresInMinutes} minutes.`,
  };
}

function passwordResetTemplate(vars: MailVariables): RenderedTemplate {
  const otp = String(vars.otp ?? vars.code ?? '');
  const expiresInMinutes = String(vars.expiresInMinutes ?? 15);

  return {
    subject: 'Reset your password',
    html: renderLayout(otpBody('Reset your password', 'Enter this code to reset your password.', otp, expiresInMinutes)),
    text: `Your password reset code is ${otp}. It expires in ${expiresInMinutes} minutes.`,
  };
}

function welcomeTemplate(vars: MailVariables): RenderedTemplate {
  const firstName = vars.firstName || 'there';

  const body = `
    <h1 style="margin:0 0 12px; font-size:20px; line-height:1.3; font-weight:700; color:${TEXT_PRIMARY}; text-align:center;">Welcome to I-One, ${firstName}!</h1>
    <p style="margin:0; color:${TEXT_SECONDARY}; text-align:center;">We're excited to have you on board. Find a pitch nearby, join a session, and get playing.</p>
  `;

  return {
    subject: 'Welcome to I-One!',
    html: renderLayout(body),
    text: `Hello ${firstName},\n\nWelcome to I-One! We're excited to have you on board.\n\nBest regards,\nThe I-One Team`,
  };
}

export const LOCAL_TEMPLATES: Record<string, (vars: MailVariables) => RenderedTemplate> = {
  'email-verification': emailVerificationTemplate,
  'password-reset': passwordResetTemplate,
  welcome: welcomeTemplate,
};
