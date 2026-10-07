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

### Detailed Description
**Twitter (X) AI Assistant** is an all-in-one productivity extension engineered to help creators, marketers, founders, and everyday users craft intelligent auto-replies and viral standalone posts directly within Twitter (X) — with zero paid API subscriptions and maximum flexibility.

Whether you want lightning-fast on-device AI that works offline, an official free Cloud REST API, or silent browser sessions with zero extra tabs, Twitter AI Assistant has you covered.

---

### 🌟 Supported AI Engines

1. **☁️ Google Gemini Cloud API (Ultra-Fast & Free)** *(Recommended)*:
   - **0 tabs opened**.
   - Direct REST integration with Google Generative Language API.
   - Powered by Google's latest **`gemini-3.1-flash-lite`** (also supports `gemini-2.5-flash`, `gemini-2.0-flash`, `gemini-1.5-flash`, and `gemini-1.5-pro`).
   - Uses a **100% free** API key from Google AI Studio (no credit card or billing needed).
   - Built-in key verification and connection testing directly in the popup.

2. **⚡ Gemini Nano (Chrome Built-in On-Device AI)**:
   - **0 tabs opened**.
   - Runs 100% privately on your local hardware (GPU/NPU) via Chrome's Prompt API.
   - Works offline and generates contextual replies in under a second.

3. **🌐 Headless Web Engine (Google Cookie Session)**:
   - **0 tabs opened**.
   - Communicates silently in the background using your active Google login cookies.
   - Zero configuration or API keys required.

4. **🗂️ Gemini Web Tab (DOM Automation)**:
   - Automates the real `gemini.google.com/app` interface with complex reasoning models.
   - Includes an **Auto-Close Tab** toggle so temporary tabs disappear automatically.

---

### 🚀 Core Features

- **Split-Button Composer Integration**:
  - Automatically injects native-looking `[ ✦ AI Reply | ▾ ]` and `[ ✦ AI Post | ▾ ]` buttons directly into Twitter's reply composers and tweet dialogs.
  - 1-click generation with your default tone, or click the dropdown arrow to select on the fly.

- **6 Context-Aware Reply Tones**:
  - *Quick*: Crisp, punchy, conversational replies.
  - *Agree*: Supportive validation with thoughtful additions.
  - *Thoughtful*: Deep, analytical, value-driven perspectives.
  - *Witty*: Clever, humorous banter and playful takes.
  - *Question*: Engaging open-ended questions that drive comments.
  - *Counter-Point*: Respectful, constructive alternate viewpoints.

- **AI Post Generator (7 Viral Archetypes)**:
  - Generate standalone tweets from scratch or polish existing rough drafts.
  - Styles include *Engaging Hook*, *Insight & Value*, *Storytelling*, *Question / Poll Prompt*, *Hot Take*, *Actionable Tip*, and *Minimalist*.
  - **Topic Prompt Mode**: If the tweet composer is empty, clicking AI Post opens an inline prompt popover to guide the generation.

- **On-Screen Floating HUD Widget**:
  - Draggable, collapsible widget that sits on your Twitter feed.
  - Live engine status indicators for all 4 engines (`Nano`, `Cloud API`, `Headless`, `Web`).
  - **Inline Custom Prompt Textarea**: Define constraints (e.g., *"no emojis"*, *"keep under 180 chars"*, *"sound like a tech founder"*) directly on-page without opening the extension popup.
  - Quick Post Drafter & tone selector.

- **Standalone Popup Post Creator**:
  - Dedicated tab inside the extension popup to draft, edit, copy, or launch tweets to 𝕏 with one click.

- **Intelligent Engine Fallback**:
  - Automatically cascades across `Cloud API` → `Gemini Nano` → `Headless Web` → `Gemini Web Tab` to prevent generation interruptions.

- **Clean Output Guardrails**:
  - Automatic filtering of internal deliberation scratchpads, multi-option headings, and prompt echoes.

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

---

## 5. Version History

- **v1.3.0** (Cloud API & HUD Overhaul):
  - Added official Google Gemini Cloud REST API engine with zero tabs and free Google AI Studio integration.
  - Multi-model selection: `gemini-3.1-flash-lite` default, `gemini-2.5-flash`, `gemini-2.0-flash`, `gemini-1.5-flash`, and `gemini-1.5-pro`.
  - Built-in instant API key verification & connection test.
  - Upgraded Floating HUD to 338px with live 4-engine status chips and multiline prompt textarea editor.
  - Overhauled Headless stream parser and session token extraction.
  - Hardened output cleaner against model deliberation scratchpads.
  - Intelligent 4-tier engine fallback chain.
- **v1.2.1**: Text duplication fixes in Draft.js, double-click guards, and HUD prompt editor integration.
- **v1.2.0**: On-screen Floating HUD widget, AI Post Generator (7 archetypes), and Popup Post Creator.
- **v1.1.0**: Draft.js cursor sync improvements, popup security hardening, and performance optimizations.
- **v1.0.1**: Store compliance refactor, timeline context guardrails, and Gemini Nano compatibility verification.
- **v1.0.0**: Initial release featuring multi-engine replies (Gemini Nano, Headless, Web Tab) with 6 tones and custom prompt instructions.
