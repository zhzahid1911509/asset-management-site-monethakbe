export type MailKind = "verification" | "password-reset" | "invitation";
export const AUTH_LINK_SECONDS = 3600;
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function emailTemplate(kind: MailKind, url: string, recipient: string) {
  const origin = new URL(process.env.APP_ORIGIN!);
  const actionURL = new URL(url);
  if (
    !["https:", "http:"].includes(origin.protocol) ||
    actionURL.origin !== origin.origin ||
    actionURL.username ||
    actionURL.password
  )
    throw new Error("EMAIL_URL_INVALID");
  const content = {
    verification: {
      subject: "Verify your email address",
      title: "Welcome to Mone Thakbe",
      body: "Thank you for creating your account. Please verify your email address to start organizing your family's assets and important records.",
      button: "Verify email address",
      expiry:
        "This verification link expires in 1 hour. If it has expired, request a new verification email from the sign-in page.",
      safety:
        "If you did not create this account, you can safely ignore this email.",
    },
    "password-reset": {
      subject: "Reset your password",
      title: "Password reset request",
      body: "We received a request to reset the password for your Mone Thakbe account. Use the secure link below to choose a new password.",
      button: "Reset password",
      expiry:
        "This password-reset link expires in 1 hour. If it has expired, request a new link from the sign-in page.",
      safety:
        "If you did not request this change, do not use the link. Your password will remain unchanged unless you complete the reset.",
    },
    invitation: {
      subject: "You are invited to a family workspace",
      title: "Your family workspace invitation",
      body: "You have been invited to join a family workspace on Mone Thakbe. Sign in or create an account using the email address that received this invitation, then reopen this link to review and accept it.",
      button: "Open invitation",
      expiry:
        "This invitation expires 48 hours after it was created and can be accepted once. After expiry, ask the family owner for a new invitation.",
      safety:
        "If you were not expecting this invitation, you can ignore it. Receiving this email does not automatically add you to the workspace.",
    },
  }[kind];
  const text = `${content.title}\n\nHello,\n\n${content.body}\n\n${content.button}:\n${url}\n\n${content.expiry}\n\n${content.safety}\n\nFor your security, do not forward this email or share its link. We will never ask you to send your password by email.\n\nWarm regards,\nThe Mone Thakbe Team\nপরিবারের সবকিছু, এক ঠিকানায়।\n${origin.origin}\n\nThis automated service email was sent to ${recipient}.`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(content.subject)}</title></head><body style="margin:0;background:#f3f6f8;color:#18324b;font-family:Arial,sans-serif"><div style="display:none;max-height:0;overflow:hidden">${escape(content.subject)} — Mone Thakbe</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 12px"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e0e6eb;border-radius:12px"><tr><td style="padding:24px 32px;border-bottom:3px solid #c49a45"><img src="${escape(origin.origin)}/brand/logo.jpg" width="200" alt="মনে থাকবে — Family Asset Management" style="display:block;width:200px;max-width:100%;height:auto"></td></tr><tr><td style="padding:32px;line-height:1.7"><h1 style="font-size:25px;line-height:1.3;margin:0 0 24px">${escape(content.title)}</h1><p>Hello,</p><p>${escape(content.body)}</p><table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="#12345a" style="border-radius:6px"><a href="${escape(url)}" style="display:inline-block;padding:14px 24px;color:#ffffff;text-decoration:none;font-weight:bold">${escape(content.button)}</a></td></tr></table><p style="font-size:14px">${escape(content.expiry)}</p><p style="font-size:14px">If the button does not work, copy and paste this address into your browser:</p><p style="font-size:12px;word-break:break-all"><a href="${escape(url)}" style="color:#12345a">${escape(url)}</a></p><p>${escape(content.safety)}</p><p style="font-size:13px;color:#526274">For your security, do not forward this email or share its link. We will never ask you to send your password by email.</p><p>Warm regards,<br><strong>The Mone Thakbe Team</strong><br><span lang="bn">পরিবারের সবকিছু, এক ঠিকানায়।</span></p></td></tr><tr><td style="padding:20px 32px;background:#f7f9fb;color:#526274;font-size:12px;line-height:1.6">This automated service email was sent to ${escape(recipient)}.<br><a href="${escape(origin.origin)}" style="color:#12345a">Mone Thakbe</a> · Remember What Matters.</td></tr></table></td></tr></table></body></html>`;
  return {
    to: recipient,
    subject: `${content.subject} — মনে থাকবে`,
    text,
    html,
  };
}
