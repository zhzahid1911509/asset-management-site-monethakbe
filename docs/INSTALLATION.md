# Logo, email templates and mobile installation — 0.5.1

## Branding

The supplied `mone-thakbe-logo.jpg` is included unchanged at `public/brand/logo.jpg`. The shared Brand component uses it on the home header/footer, workspace sidebar, authentication, setup, invitations and error/not-found pages. Mechanically resized, padded PNG variants provide browser and home-screen icons without changing the artwork. The full source artwork is retained, including its original website address. These images are public branding assets, not private documents.

## Email

All currently implemented email types use the shared `src/server/email-templates.ts`: email verification (including resend), password reset and family invitation. Each includes a subject, greeting, explanation, action button, copyable fallback URL, expiry guidance, security note and team signature. HTML uses inline styling and presentation tables; plain text remains available if a mail client blocks HTML/images. Recipient and URL values are escaped in HTML; action links must match APP_ORIGIN.

Verification and password-reset token lifetimes are explicitly set to one hour in Better Auth. Invitations retain their existing 48-hour validity. The email worker forwards both HTML and text, while old queued text-only payloads still work. Restart the web process and worker after upgrading. Templates apply to newly queued messages; existing encrypted jobs are not rewritten. A public HTTPS APP_ORIGIN is needed for recipients to load the logo; localhost images cannot be fetched from recipients' mail clients. No real emails were sent during development. Email/push reminders remain unimplemented.

## Install the web app

Use **Install on Android / iPhone** at the bottom of any page. The manifest defines standalone display, the root scope, `/app` as the launch URL, theme color and logo icons. Sign-in remains required and the same server permissions apply.

- Android: open the deployed HTTPS site in Chrome. Use the Install app button when the browser offers a prompt, or its menu's Install app/Add to Home screen option.
- iPhone/iPad: open the site in Safari, choose Share → Add to Home Screen, enable Open as Web App if offered, then Add. Exact labels and availability depend on browser/OS version. If opened inside another app, open the site in the device browser first.
- Desktop: supported browsers may also expose installation through the same prompt/menu.

Installation prompts are browser-controlled; the app does not promise one will appear on every device. Cancelled prompts are not automatically retriggered. Installed/standalone mode is detected when opening the installed app; the site does not claim it can reliably inspect every app installed on the device.

The service worker uses network-only requests and never puts private pages, API responses, files or session data into Cache Storage. Failed navigation displays a generic offline screen. It does not enable offline editing, background synchronization or push delivery. Browser cookies/session storage continue to follow normal authentication behavior. The site must use HTTPS, except localhost development. Serve `/sw.js` without caching and retain the supplied root scope header. There are no APK/IPA files and no Play Store/App Store publication.

## Verification checklist for your deployment

1. Check home, sign-in, workspace and invitation logos on desktop/mobile widths.
2. Request verification/reset emails for a test account; inspect HTML, plain text, logo, action link and expiry wording. Verify invitation delivery separately. Do not reuse expired token links.
3. Over HTTPS, inspect `/manifest.webmanifest`, all `/brand/icon-*.png` URLs and `/sw.js`.
4. On Android and iPhone/iPad, install, launch, sign in and sign out. Check the icon and standalone layout.
5. Disconnect networking and reload: only the generic offline message should appear. Reconnect and retry. Inspect Cache Storage to confirm the worker has not stored private data.

Automated tests cover templates, HTML escaping, URL restrictions, transport payloads, legacy queue decoding, manifest assets and offline/API service-worker behavior. Real-device installation, email-client rendering and live delivery remain deployment checks.

Sources: [MDN installation guide](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable), [MDN install prompt](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Trigger_install_prompt), [Apple Safari home-screen web apps](https://support.apple.com/en-lamr/guide/iphone/iphea86e5236/ios).
