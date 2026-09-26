# Changelog

All notable changes to the **Twitter AI Auto Reply** extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.1] - 2026-09-25

- **Fixed Tweet & Reply Text Duplication**:
  - Replaced browser `execCommand('insertText')` with DOM Range synchronization and synthetic `ClipboardEvent('paste')` intercepted by Draft.js.
  - Eliminated duplicate native DOM text nodes while ensuring text remains 100% editable (<kbd>Enter</kbd> for line breaks, <kbd>Backspace</kbd>, and <kbd>Delete</kbd>).
- **Re-entrancy & Double-Click Protection**:
  - Added synchronous `dataset.busy` guards to prevent rapid clicks from dispatching duplicate generation requests.
- **Custom Prompt Instructions in Floating HUD**:
  - Integrated custom prompt instructions editor directly into the on-screen Floating HUD with a dedicated quick-save button.
- **UI Enhancements & Responsive Layout**:
  - Added vertical slider to post style and tone menus to prevent viewport clipping.
  - Added right padding to prevent the floating pill from being cut off when dragged to the far right.

## [1.2.0] - 2026-09-22

- **Interactive Floating HUD Widget on Twitter**:
  - Added a collapsible, draggable on-screen assistant widget (`✦ Gemini AI`) on Twitter/X pages.
  - Live AI engine connection status with real-time indicators and refresh capability.
  - Quick-switch dropdowns for default Reply Tone and Post Style without opening the extension popup.
  - Quick Post Drafter: enter any topic, click *Draft & Open Tweet*, and it automatically invokes Gemini, opens Twitter's compose window, and types in the drafted post.
  - Position memory (persists where the user places it on screen) and popup preference toggle to show/hide.
- **Dedicated Save & Reset Buttons for Custom Prompt Instructions**:
  - Added working "Save" and "Reset to Default" actions under Custom Prompt Instructions with active feedback.
- **3-Tier Strict Output Enforcement (Fix for "No Emoji" / Negations)**:
  - High-priority prompt clause injection, dynamic system prompt rules for Gemini Nano, and deterministic output regex filtering.
- **AI New Post Generation ("✦ AI Post")**: Extended beyond replies to support creating brand new standalone tweets and threads on Twitter/X.
- **Smart Composer Auto-Detection**:
  - Automatically detects whether a composer is an inline/modal **Reply** or a **New Post** (home timeline *"What is happening?!"* box or sidebar *"Post"* modal).
  - Dynamically adapts the button label between **`✦ AI Reply`** and **`✦ AI Post`**.
- **Dual Input Modes for New Posts**:
  - **Draft Polish & Expand**: Refines rough thoughts, bullet points, or drafts already typed into Twitter's composer box.
  - **Topic Prompt Popover**: If the composer is empty, clicking *AI Post* opens a floating micro-modal prompt bar to generate a tweet from any topic or idea.
- **7 Dedicated Post Styles**: Added Twitter-native post archetypes (*Engaging Hook*, *Insight & Value*, *Announcement*, *Bold Hot Take*, *Witty & Relatable*, *Discussion Starter*, *Thread Opener*).
- **Standalone Popup Post Creator**: Added a dedicated "Post Creator" tab in the extension popup with character counter, live editor, 1-click clipboard copy, and "Post on X ↗" launcher.
- **Multi-Engine Post Backend**: Added `GENERATE_POST` message routing with specialized Twitter post prompt builders across Gemini Nano, Headless, and Web Tab engines.
- **Bug Fixes & System Hardening**:
  - **Headless Stream Parser**: Filtered out prompt echoes and internal RPC identifiers, preventing prompt text from being selected as the candidate reply.
  - **Nano Availability Detection**: Fixed Chrome Prompt API check to properly identify unsupported devices (`"no"`) instead of falsely flagging them as available.
  - **Twitter SPA Toolbar Reconciliation**: Fixed composer button injection to re-inject into toolbars whose children were re-rendered by React.
  - **Verified Editor Text Insertion**: Added robust fallback hierarchy to ensure generated text reliably fills Twitter's Draft.js editor without duplication.
  - **Web Tab Streaming Stability**: Hardened response completion checks to guard against premature cutoffs during token packet jitter.
  - **Popup Layout Consistency**: Fixed tab panel switching to preserve CSS flexbox `gap: 12px` and isolated error alerts from editable tweet fields.
  - **Event Listener Cleanup**: Removed dangling document listeners on popover dismissal and added debounced HUD viewport clamping on browser resize.

---

## [1.1.0] - 2026-09-20

### Fixed
- **Twitter Reply Box Double-Insert**: Replaced `execCommand('insertText')` with an `InputEvent('beforeinput')` insertion strategy to prevent the Twitter (Draft.js) editor from duplicating inserted reply text.
- **Backspace & Delete Editing**: Resolved editor selection and cursor synchronization issues (`selectionchange`), restoring full backspace and delete functionality after AI reply insertion.
- **Popup XSS Mitigation**: Replaced `innerHTML` rendering with safe DOM node creation in popup generation test output.
- **Gemini Automation Reliability**: Removed redundant click dispatch in `content_gemini.js` and improved fallback clipboard error handling in `content_twitter.js`.

### Performance & Optimizations
- **Faster Headless Engine**: Streamlined response body parsing for direct Gemini calls, reducing latency by 1–3 seconds per generation.
- **Optimized Web Tab Engine**: Reduced tab readiness polling (400ms → 100ms), response wait checks (500ms → 250ms), and DOM resolution delays, cutting ~1.2s off Gemini Web tab generations.

### UI & UX
- **Rebranding**: Updated popup "Donate" drawer to "Support Us" with refreshed Trakteer and Buy Me a Coffee links.
- **Popup Layout**: Fixed layout and alignment for support items and button icons.

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
