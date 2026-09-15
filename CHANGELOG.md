# Changelog

All notable changes to the **Twitter AI Auto Reply** extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.1] - 2026-09-15

### Fixed & Compliance
- **Chrome Web Store Compliance (Permission Fix)**: Removed unused `"cookies"` permission from `manifest.json`. Direct headless requests use `host_permissions: ["https://gemini.google.com/*"]` with `fetch(..., { credentials: 'include' })` instead of the privileged `chrome.cookies` API, resolving the store review warning (*"Requesting but not using permissions: cookies"*).
- **Declarative Net Request Header Rewriting**: Added `'other'` to DNR rule `resourceTypes: ['xmlhttprequest', 'other']` so header modification rules reliably apply to Service Worker `fetch()` calls across all Chromium versions.
- **Home Timeline Context Bug**: Guarded the fallback query selector in `extractTweetContext()` with `if (window.location.pathname.includes('/status/'))`. Composing a standalone tweet from `/home` no longer grabs the first random tweet appearing in the timeline feed.
- **Multi-Engine Fallback Chain**: Replaced the fragile try/catch block with `executeWithFallback()`. When `headless` fails, the extension automatically tries `Gemini Nano` (if available), and then smoothly falls back to `Gemini Web Tab` rather than throwing an early unhandled error.

### Added & Improved
- **Split-Button Composer UX**: Re-engineered the in-composer button into a true dual-action split button:
  - **"✦ AI Reply"**: One-click instant generation using the user's configured default tone.
  - **"▾"**: Opens the tone selection dropdown menu (*Quick, Agree, Thoughtful, Witty, Question, Counter-Point*).
- **Session Token Persistence**: Headless tokens (`at`, `fdr`, `bl`) are now stored in `chrome.storage.session`. Tokens persist across Service Worker idle/wake-up cycles, eliminating redundant 2MB+ HTML fetches.
- **Gemini Nano Guide & Verification**: Added [check_gemini_nano.md](check_gemini_nano.md) and a dedicated **"Check Gemini Nano"** launcher button in the extension popup.
- **Donate Section**: Added an expandable donation drawer in the extension popup with links to Trakteer, Buy Me a Coffee, and a 1-click EVM crypto address copier.
- **Product Landing Page & Playground**: Added a product showcase website in [`website/`](website/) featuring an interactive typewriter reply demo, FAQ, and installation guide.
- **Chrome Web Store Submission Guide**: Added [CHROMEWEBSTORE.md](CHROMEWEBSTORE.md) with listing copy, permission justifications, graphic specs, and packaging instructions.

---

## [1.0.0] - 2026-09-13

### Initial Release
- Multi-engine AI reply generator for Twitter (X) without requiring paid API keys.
- **Engine 1**: Gemini Nano on-device Prompt API (0 tabs, local GPU).
- **Engine 2**: Headless direct Google login cookie requests (0 tabs).
- **Engine 3**: Gemini Web tab DOM automation with optional auto-close.
- 6 reply tones: Quick, Agree, Thoughtful, Witty, Question, Counter-Point.
- Custom prompt instructions support.
- Glassmorphism popup UI with live engine connection status.
