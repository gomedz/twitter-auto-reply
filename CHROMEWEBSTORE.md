# Chrome Web Store Listing: Twitter AI Auto Reply (Gemini Web)

## Extension Metadata

- **Name**: Twitter AI Auto Reply (Gemini Web)
- **Version**: 1.0.0
- **Summary / Short Description** (max 132 characters):
  Generate smart, contextual Twitter (X) replies instantly using your logged-in Gemini web session without needing any API keys.
- **Category**: Productivity / Social & Communication
- **Pricing**: Free

---

## Detailed Description

Transform your Twitter (X) engagement with AI-powered replies powered by Google Gemini — completely free and with NO API keys required!

Twitter AI Auto Reply seamlessly integrates into your Twitter browsing experience. By adding a sleek, native-feeling "✦ AI Reply" button right below the reply composer, you can generate authentic, relevant, and engaging replies with a single click.

### ✨ Key Features
- **Zero API Keys Required**: Simply log in to your Google Gemini account (gemini.google.com) in Chrome. The extension leverages your existing authenticated session.
- **In-Context Button**: Injects right below the reply box in both inline tweet threads and modal popups.
- **Diverse Tones**:
  • ⚡ Quick Reply — Natural, balanced, and conversational
  • 👍 Agree & Support — Validating and encouraging
  • 💡 Thoughtful Insight — Value-packed intellectual angle
  • 😂 Witty & Funny — Clever, humorous engagement
  • ❓ Ask a Question — Stimulates ongoing dialogue
  • 🔥 Counter-Point — Respectful alternative perspective
- **Native DraftJS Typing**: Uses synthetic keyboard events so Twitter's character counter, text formatting, and native "Reply" button work immediately.
- **Custom Instructions**: Configure your preferred reply length, language nuances, or custom rules in the extension popup.

---

## Permissions Justification

| Permission | Justification |
|---|---|
| `storage` | Required to store user preferences such as default reply tone, custom prompt guidelines, and auto-open Gemini settings locally on your device. |
| `tabs` | Required to detect whether an active Gemini (gemini.google.com) tab exists and communicate generation requests securely between Twitter and Gemini. |
| Host `https://twitter.com/*` & `https://x.com/*` | Required to inject the reply button below the Twitter composer and read the tweet being replied to for context. |
| Host `https://gemini.google.com/*` | Required to interact with your authenticated Gemini web session to submit the prompt and retrieve the generated reply. |

---

## Privacy & Data Use Disclosures

- **Data Collection**: No personal data or user credentials are collected, logged, or sent to any third-party analytics servers.
- **Data Transmission**: Prompts and tweet text are transmitted strictly between your local browser tabs (Twitter and Gemini) on your device.
- **Authentication**: No passwords or Google account credentials are ever accessed by the extension; all authentication is handled natively by Google within your browser.
