# Changelog

All notable changes to **Twitter AI Auto Reply & Post Creator** are documented in this file.
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.1] - 2026-09-25

### Fixed
- **Text Duplication**: Replaced `execCommand` with Range synchronization and paste events to eliminate duplicate text in Draft.js while preserving full keyboard editability.
- **Double-Click Protection**: Added re-entrancy guards (`dataset.busy`) to prevent rapid clicks from triggering duplicate generations.

### Added & Improved
- **HUD Prompt Editor**: Integrated custom prompt instructions directly into the on-screen Floating HUD with quick-save.
- **UI & Layout**: Added vertical scrolling to tone/style menus to prevent viewport clipping and adjusted HUD drag padding.

---

## [1.2.0] - 2026-09-22

### Added
- **Floating HUD Widget**: Draggable, collapsible on-screen Twitter widget with live engine status, tone/style quick-switch, and Quick Post Drafter.
- **AI Post Generator**: Extended beyond replies to create standalone tweets with 7 archetypes and composer auto-detection (`✦ AI Reply` vs `✦ AI Post`).
- **Dual Post Modes**: Polish existing drafts or generate new tweets from a topic prompt popover.
- **Popup Post Creator**: Dedicated tab in popup to craft, edit, and launch tweets directly to 𝕏.
- **Strict Prompt Guardrails**: 3-tier prompt and regex filtering to enforce constraints (e.g., "no emojis").

### Fixed & Improved
- **Headless Parser**: Filtered prompt echoes and RPC noise from candidate replies.
- **Nano Detection**: Fixed Chrome Prompt API check to properly handle unsupported hardware.
- **Stability**: Hardened DOM injection, tab streaming completion, and event listener cleanup.

---

## [1.1.0] - 2026-09-20

### Fixed
- **Reply Duplication**: Fixed Draft.js text duplication and backspace/delete cursor sync.
- **Security**: Mitigated popup XSS by replacing `innerHTML` with safe DOM node creation.

### Improved & Optimized
- **Performance**: Streamlined headless response parsing (-1 to 3s) and web tab polling (-1.2s).
- **UI & Branding**: Updated popup support drawer with refreshed Trakteer ID and Buy Me a Coffee links.

---

## [1.0.1] - 2026-09-15

### Fixed & Compliance
- **Store Compliance**: Removed unused `cookies` permission; switched to session credentials in fetch.
- **Timeline Context**: Guarded context selector to avoid capturing feed tweets when composing from `/home`.
- **Fallback Chain**: Automatic fallback from Headless → Gemini Nano → Web Tab on errors.

### Added
- **Split-Button UX**: Dual-action `[ ✦ AI Reply | ▾ ]` button for 1-click default or tone selection.
- **Token Caching**: Persisted session tokens across Service Worker wake-up cycles.
- **Nano Verification**: Added built-in Gemini Nano compatibility test and setup guide.

---

## [1.0.0] - 2026-09-13

### Initial Release
- Multi-engine AI replies for 𝕏 without paid API keys (Gemini Nano, Headless Web, Web Tab).
- 6 reply tones (Quick, Agree, Thoughtful, Witty, Question, Counter-Point).
- Custom prompt instructions support and glassmorphism popup UI.
