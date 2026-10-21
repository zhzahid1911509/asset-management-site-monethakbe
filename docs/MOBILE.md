# Mobile interface — 0.7.1

Supports responsive browser/installed-PWA layouts; this is not a native Android APK or iOS App Store release. Online access is still required.

- Viewport uses device width, initial scale 1 and safe-area cover. User zoom stays enabled.
- Navigation switches at 850px: explicit close control, Escape handling, contained keyboard focus, hidden/inert closed drawer, background scroll lock, and focus return. Resizing to desktop restores normal navigation.
- Touch controls have 44px minimum height; mobile text fields use 16px text.
- Forms, reports, settings and metadata stack on narrow screens. Large tables retain columns inside focusable horizontal scroll regions.
- Dialogs use dynamic viewport height and scroll internally. Safe-area padding accounts for notches/home indicators; small screens use bottom-aligned dialogs.
- Theme selection stays in document flow on mobile so it does not cover controls.
- Light PNG/dark JPG artwork, unique document keys and storage-only download configuration fixes are included. Scanning is still mandatory for new uploads; Vercel scanner hosting is not solved by this UI release.

## Verification

Strict TypeScript and production webpack build checked. Browser installation failed in the execution environment; no real Android/iOS or visual-browser certification is claimed.

Before deployment, check widths 320, 375, 390, 430, 768 and 1024px, portrait/landscape, both themes, Bengali/English, and installed PWA mode. Open/close navigation, tab through it, rotate, and verify focus returns. Open forms and the virtual keyboard, reach bottom actions, upload/download a small file, inspect reports and scroll tables. Verify pinch zoom, notch/home-indicator spacing, and print reports on white backgrounds.

## 0.10.1 — small-screen dialogs

Shared dialogs use a full-screen layout at widths up to 600px, with a stationary close header and independently scrolling content. Form grid tracks and native input/select widths are constrained to the viewport. The visual viewport controls available height when a software keyboard opens, and safe-area padding protects controls on notched devices. Opening Add asset focuses Close rather than opening the keyboard automatically. Background scrolling is locked and restored on close.

Narrow-screen toolbars, report/home/reminder actions and notification settings also wrap or stack. No database migration or new environment variable is required. Deploy the updated source, then fully close and reopen the installed app to load the new version.

Device acceptance checks: on Android Chrome and iOS Safari/PWA, open My assets → Add asset, select a property type, expand category details, focus the last input with the keyboard open, scroll to Save, rotate the screen and close. Check 320px width, Bengali labels, both themes, and that the underlying page retains its scroll position.
