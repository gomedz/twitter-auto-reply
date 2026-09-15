# Chrome Web Store Listing — Twitter AI Auto Reply (Gemini Web)

> Version: 1.0.1
> Last Updated: 2026-09-15
> Status: Ready for Re-Submission (Resolved "cookies" permission warning)

---

## 1. Store Listing Details

**Extension Name** [REQUIRED]
```
Twitter AI Auto Reply (Gemini Web)
```
*(Matches `manifest.json`. Length: 34 / 75 chars)*

**Short Description** [REQUIRED]
```
Generate intelligent auto-replies on Twitter (X) using your logged-in Gemini session without any API key.
```
*(Length: 104 / 132 chars)*

**Detailed Description** [REQUIRED]
*(Copy and paste this into the description box in the Chrome Web Store dashboard. Markdown is stripped by CWS, so keep formatting clean with line breaks and bullet characters)*

```
Elevate your Twitter (X) engagement with intelligent, context-aware auto-replies powered by Google Gemini! 

Twitter AI Auto Reply lets you generate witty, thoughtful, or supportive replies to any tweet with a single click—completely free and without needing paid API keys or complicated setup.

KEY FEATURES:
• One-Click AI Reply: An intuitive "AI Reply" button appears right beneath tweets in your timeline and thread view.
• 3 Powerful AI Engines:
  1. Gemini Nano (Local AI): Runs 100% on-device inside Chrome with zero latency and complete privacy (requires Chrome Built-in AI).
  2. Headless Direct: Connects directly to your logged-in Gemini session in the background with no extra tabs needed.
  3. Web Tab Automation: Generates replies through a lightweight, automated Gemini tab that closes automatically when finished.
• Multiple Reply Tones: Choose from Quick & Natural, Agree & Supportive, Thoughtful Insight, Witty & Humorous, Counter-Point, or Ask a Question.
• Custom Prompt Instructions: Add custom rules such as character limits, language preference, or style instructions.
• 100% Client-Side & Private: No third-party servers, no telemetry, and no data harvesting. Everything runs entirely within your browser.

HOW TO USE:
1. Make sure you are logged into your Google account at gemini.google.com (or have Chrome Gemini Nano enabled).
2. Browse Twitter (X) as you normally do.
3. Beneath any tweet, click the new "✦ AI Reply" button.
4. Select your preferred tone, or click Generate. The generated response will be inserted directly into the reply composer for your review before you post!

PRIVACY FIRST:
We take your privacy seriously. This extension does NOT collect, store, or sell any personal data, tweets, or credentials. All interactions occur directly between your browser and Google Gemini.
```

**Category** [REQUIRED]
```
Social & Communication
```
*(Alternative: Productivity)*

**Single Purpose** [REQUIRED]
```
Generates context-aware reply drafts for tweets on Twitter (X) using Google Gemini.
```

**Primary Language** [REQUIRED]
```
English
```

---

## 2. Graphics & Asset Requirements

| Asset | Dimensions | Requirement | Notes / Status |
|-------|-----------|-------------|----------------|
| **Store Icon** | 128×128 PNG | **Required** | Ready in `icons/icon-128.png` |
| **Screenshot 1** | 1280×800 or 640×400 | **Required** | Tweet feed showing the "✦ AI Reply" button and tone selector |
| **Screenshot 2** | 1280×800 or 640×400 | Recommended | Extension popup showing the 3 AI engine choices |
| **Screenshot 3** | 1280×800 or 640×400 | Recommended | Generated reply filled into the Twitter composer |
| **Small Promo Tile** | 440×280 PNG | Recommended | Ready in `promo_small_440x280.png` |
| **Marquee Promo Tile**| 1400×560 PNG | Optional | Ready in `promo_marquee_1400x560.png` |

> **Tip for Screenshots**: Take high-resolution screenshots on Twitter/X at 1280×800. Chrome Web Store strictly enforces 1280×800 or 640×400 (PNG or JPEG, no transparency).

---

## 3. Permissions Justification

The Chrome Web Store review team inspects every permission declared in `manifest.json`. Copy and paste these exact, plain-English justifications:

| Permission | Type | Justification to submit to Chrome Web Store |
|------------|------|---------------------------------------------|
| `storage` | permissions | Used to save user preferences locally, including selected AI engine, default reply tone, custom prompt instructions, and auto-close tab preferences. |
| `tabs` | permissions | Used to identify the active Twitter/X tab and manage/communicate with the Gemini web tab when generating replies in Web Tab mode. |
| `scripting` | permissions | Used to inject helper functions and listeners into the Twitter page to integrate the AI reply button into the timeline. |
| `offscreen` | permissions | Used to run an isolated offscreen document that parses background API responses and streams text safely without freezing the browser interface. |
| `declarativeNetRequest` | permissions | Used to set required headers (Origin, Referer) when sending requests to gemini.google.com in Headless Direct mode. |
| `https://twitter.com/*` | host_permissions | Required to display the AI reply button beneath tweets and inject generated responses into Twitter's reply text area. |
| `https://x.com/*` | host_permissions | Required to display the AI reply button beneath tweets and inject generated responses into Twitter's reply text area on the x.com domain. |
| `https://gemini.google.com/*` | host_permissions | Required to communicate with Gemini Web interface and endpoints using the user's active login session. |

---

## 4. Privacy & Data Use Disclosures

In the **Privacy practices** tab of the Chrome Developer Dashboard:

### Single Purpose Certification
- Check: *"I certify that this extension has a single, clear purpose."*

### Permission Justification
Fill in the justifications from Section 3 above for each permission.

### Data Collection
Under **Data usage**:
- **Does this extension collect or transmit any user data?**
  👉 Select **No** (The extension operates entirely client-side and transmits tweet text strictly to Google Gemini directly from your browser as part of the user-initiated action. No data is sent to developer servers or third parties).
- **Certifications**:
  - [x] *I confirm that my product does not sell user data to third parties.*
  - [x] *I confirm that my product does not use or transfer user data for purposes unrelated to its single purpose.*
  - [x] *I confirm that my product does not use or transfer user data to determine creditworthiness or for lending purposes.*

---

## 5. Privacy Policy URL

Chrome Web Store requires a publicly accessible Privacy Policy URL because the extension uses host permissions.

You can host this on:
1. **GitHub Pages** (free): Create a simple `index.html` or enable GitHub Pages on your repository.
2. **GitHub Raw / Gist**: Link to a public Gist or markdown file on GitHub:
   `https://github.com/gomedz/twitter-auto-reply/blob/main/PRIVACY.md`

### Sample Privacy Policy (PRIVACY.md):
```markdown
# Privacy Policy for Twitter AI Auto Reply

Twitter AI Auto Reply does not collect, track, or sell any personal data.

- **Data Processing**: When you click "AI Reply", the text of the selected tweet is sent directly to Google Gemini via your browser session to draft a response.
- **Data Storage**: Preferences (selected tone, engine choice, custom instructions) are stored locally on your device via Chrome's local storage API.
- **Third Parties**: No data is transmitted to the developer or any external servers. All network requests are made directly between your browser, Twitter/X, and Google Gemini.
- **Contact**: For questions or feedback, visit https://github.com/gomedz/twitter-auto-reply.
```

---

## 6. How to Build the ZIP File for Upload

Run this PowerShell command in the project folder to create the clean upload package:

```powershell
Compress-Archive -Path manifest.json, background.js, content_gemini.js, content_twitter.js, content_twitter.css, offscreen.html, offscreen.js, icons, popup -DestinationPath twitter-auto-reply.zip -Force
```

*(This automatically excludes `.git`, `.gitignore`, `README.md`, `generate_icons.py`, and developer notes)*
