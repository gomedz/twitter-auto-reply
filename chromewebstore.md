# Chrome Web Store Publication Listing: Twitter (X) AI Assistant

## 1. Store Listing Information

### Extension Name
**𝕏 (Twitter) Auto Reply & Post Creator No API**

*(Alternative Title: Twitter AI Assistant: Auto Reply & Viral Post Creator)*

---

### Short Description (max 132 characters)
AI auto-reply & post creator for Twitter (X). Supports free Gemini Cloud API, on-device Gemini Nano, & headless web with 0 tabs!

*(Character count: 129 / 132)*

---

### Detailed Description (Plain Text — Copy & Paste Directly to Chrome Web Store)

```text
Twitter (X) AI Assistant helps you write high-quality replies and viral tweets on Twitter (X) in one click — with zero paid subscriptions and zero clutter.

Whether you want lightning-fast cloud AI, 100% private on-device processing, or silent sessions that never open a tab, Twitter AI Assistant seamlessly integrates directly into your Twitter feed.

Update v1.4.0 :
i. Full compatibility and synchronization with modern X.com (Twitter) layout and architecture
ii. Restored in-page AI Reply and AI Post buttons directly in reply boxes and tweet composer
iii. Instant text insertion and live character count sync for Twitter's new composer
iv. 100% clean output across all modes with automatic removal of internal Google web artifacts
v. Guaranteed emoji placement — emojis are never placed at the beginning of tweets or replies
vi. Resilient multi-engine fallback cascade across Gemini Cloud API, Gemini Nano, Headless Web, and Web Tab

========================================
🌟 4 FLEXIBLE AI ENGINES
========================================

1. ☁️ Gemini Cloud API (Recommended — Ultra Fast & Free)
• 0 tabs opened: Runs quietly in the background via Google's official API.
• Latest Gemini Models: Powered by gemini-3.5-flash-lite (blazing fast with high free quotas), plus gemini-3.6-flash, gemini-3.8-flash, and gemini-2.5-pro.
• 100% Free: Connect your own free Google AI Studio API key (no credit card required).
• One-Click Key Tester: Instantly verify your API key and connection status in the popup.

2. ⚡ Gemini Nano (Private On-Device AI)
• 0 tabs opened & 100% offline: Runs completely on your local computer using Chrome's built-in AI.
• Maximum Privacy: Your drafts and tweets never leave your device.

3. 🌐 Headless Web Engine (Google Account Session)
• 0 tabs opened: Generates replies silently in the background using your active Google login.
• Zero Setup: No API keys or configurations required.

4. 🗂️ Gemini Web Tab (Deep Reasoning)
• Automatically drafts via the Gemini web interface when you want deep, multi-turn reasoning.
• Includes Auto-Close Tab so temporary windows close themselves automatically when done.

========================================
🚀 KEY FEATURES
========================================

• Seamless Twitter (X) Integration:
  - Injects native [✦ AI Reply] and [✦ AI Post] split-buttons directly into Twitter's reply boxes and tweet composer.
  - Click once to generate instantly with your favorite tone, or click the arrow to pick a different style.

• 6 Context-Aware Reply Tones:
  - Quick: Crisp, natural, and punchy.
  - Agree: Supportive, thoughtful validation.
  - Thoughtful: Deep, analytical, value-packed insights.
  - Witty: Playful banter and clever humor.
  - Question: Open-ended conversation starters that boost engagement.
  - Counter-Point: Constructive, respectful alternative perspectives.

• Viral Post Creator (7 Tweet Styles):
  - Craft original posts from a simple topic prompt or polish rough drafts into viral-ready tweets.
  - Choose from 7 proven formats: Engaging Hook, Insight & Value, Storytelling, Question / Poll, Hot Take, Actionable Tip, and Minimalist.
  - Topic Prompt Popover: Opens an inline helper if your composer is empty so you never face writer's block.

• On-Screen Floating HUD:
  - A compact, draggable widget right on your Twitter feed.
  - Check live engine status, switch reply tones on the fly, and draft posts without leaving the page.
  - Live Custom Prompt Box: Enter custom rules directly on-screen (e.g., "no emojis", "sound like a founder", "keep under 200 characters").

• Custom Prompt Guardrails:
  - Enforce personal style guidelines across all generations.
  - Programmatic filters guarantee your rules are honored (e.g., strictly stripping emojis or hashtags when requested).

• Standalone Popup Tweet Drafter:
  - Craft, refine, and launch tweets directly to Twitter (X) right from your browser toolbar.

• Intelligent Fallback Protection:
  - Automatically cascades to backup engines if your active engine encounters rate limits or connection issues.

• Clean & Natural Output:
  - Intentionally strips AI conversational fluff (e.g., "Here is a reply:"), eliminates scratchpad notes, preserves intended line breaks, and fits Twitter's 280-character limit cleanly.
```

---

## 2. Permissions Justification

| Permission | Scope / Use Case | Plain-English Justification for Reviewers |
|---|---|---|
| `storage` | Extension data persistence | Saves user configuration locally via `chrome.storage.local` (active engine, selected Cloud API model, Google AI Studio key, custom prompt instructions, reply tone preferences, and auto-close tab settings). |
| `tabs` | Tab lifecycle & navigation | Queries and opens tabs for the Gemini Web Tab automation engine, auto-closes temporary automation tabs upon reply extraction (when enabled), and opens Twitter composer URLs from the Popup Post Creator. |
| `scripting` | Tab DOM automation | Injects helper scripts into `gemini.google.com` tabs during Web Tab mode to input prompts and observe streamed replies. |
| `offscreen` | Offscreen document execution | Creates a sandboxed offscreen document to access Chrome's built-in `window.ai` / `window.LanguageModel` (Gemini Nano Prompt API) from the background Service Worker context. |
| `declarativeNetRequest` | Safe network header rules | Modifies request headers (Origin, Referer, and credentials) exclusively for silent background communication with Google services in Headless Web mode, eliminating the need for full webRequest interception. |

### Host Permissions Justification

| Host Pattern | Use Case |
|---|---|
| `https://twitter.com/*` & `https://x.com/*` | Required to inject AI reply and post buttons into composer containers and display the on-screen Floating HUD widget on Twitter/X. |
| `https://gemini.google.com/*` | Required for the Headless Web engine and Gemini Web Tab DOM automation engine to communicate with Google Gemini. |
| `https://generativelanguage.googleapis.com/*` | Required to make direct REST API calls to the official Google Generative Language endpoint when using the Google Gemini Cloud API engine. |

---

## 3. Privacy & Data Use Disclosures

- **Single-Purpose Policy**: The extension has one single purpose: assisting users in drafting contextual replies and standalone posts on Twitter (X) using their preferred AI engine.
- **No External Data Collection**: We do not collect, track, monetize, or transmit any user browsing data, tweet history, or personal information to any third-party servers.
- **Local Storage Security**: API keys, user instructions, and preferences are stored exclusively on the user's local device in `chrome.storage.local`.
- **Zero Third-Party Middlemen**: Cloud API requests travel directly and securely from the user's browser to Google's official endpoint (`generativelanguage.googleapis.com`).
- **On-Device Privacy**: When Gemini Nano is selected, AI processing occurs entirely on the user's local machine without sending tweet text over the internet.

---

## 4. Category & Tags

- **Primary Category**: Productivity
- **Secondary Category**: Social & Communication
- **Keywords / Search Terms**: twitter auto reply, x ai assistant, gemini nano, twitter post creator, ai tweet generator, viral tweet generator, gemini cloud api, social media ai, auto reply twitter
