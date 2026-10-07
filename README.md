# Twitter (X) AI Assistant: Reply & Post Creator

![Twitter AI Auto Reply Banner](promo_marquee_1400x560.png)

Generate intelligent auto-replies and craft viral tweets directly on **Twitter (X)** with zero friction — featuring on-device local AI, cloud REST API, and headless web sessions.

---

## 🌟 Supported AI Engines

You can choose your preferred engine anytime with one click in the extension popup or via the on-screen Floating HUD:

1. **☁️ Google Gemini Cloud API (Ultra-Fast & Free)** *(Recommended)*:
   - **0 tabs opened**.
   - Direct official REST integration with Google Generative Language API.
   - Ultra-fast response times powered by **`gemini-3.1-flash-lite`** (also supports `gemini-2.5-flash`, `gemini-2.0-flash`, `gemini-1.5-flash`, and `gemini-1.5-pro`).
   - Uses a **100% free** API key from [Google AI Studio](https://aistudio.google.com/app/apikey) (no billing or credit card required).
   - Built-in connection testing & key verification right from the popup.

2. **⚡ Gemini Nano (Built-in On-Device AI)**:
   - **0 tabs opened**.
   - Runs directly inside Chrome using your computer's local hardware (GPU/NPU).
   - 100% private, works offline, and generates replies in under a second.

3. **🌐 Headless Web (Google Cookie Session)**:
   - **0 tabs opened**.
   - Sends silent background requests directly using your active Google login session cookies.
   - No API keys or setup required.

4. **🗂️ Gemini Web Tab (DOM Automation)**:
   - Automates the real [gemini.google.com/app](https://gemini.google.com/app) chat interface.
   - Includes an **Auto-close tab** toggle so temporary background tabs vanish automatically once the reply is pasted.
   - Ideal fallback for full web model reasoning.

---

## 🔑 Setting Up Google Gemini Cloud API (Free & Fast)

To use the **Cloud API** engine:

1. Visit [Google AI Studio](https://aistudio.google.com/app/apikey) and sign in with your Google account.
2. Click **Create API key** (it is completely free under Google's standard tier, no credit card required).
3. Copy your API key.
4. Click the **Twitter AI Assistant** icon in Chrome to open the popup.
5. In **AI Generation Engine**, select **☁️ Google Gemini (Cloud API)**.
6. Paste your key into the **API Key** input field and click **Verify Key**.
7. Once verified (green status badge), you are ready to generate replies and posts at maximum speed!

---

## 🔍 How to Check if Gemini Nano is Supported in Your Chrome

Before using **Option 2 (Gemini Nano)**, verify if your Chrome browser supports on-device AI:

### Quick 5-Second Test:
1. Open any webpage in Chrome.
2. Press `F12` (or right-click anywhere and choose **Inspect**), then click the **Console** tab.
3. Paste the following command and hit `Enter`:
   ```javascript
   'LanguageModel' in window || 'ai' in window
   ```
4. **If it returns `true`**: 🎉 Gemini Nano is supported on your browser!
5. **If it returns `false`**: Follow the steps below to enable it.

### How to Enable Gemini Nano in Chrome:
1. In your address bar, go to:
   ```text
   chrome://flags/#prompt-api-for-gemini-nano
   ```
   Set it to **Enabled**.

2. Next, go to:
   ```text
   chrome://flags/#optimization-guide-on-device-model
   ```
   Set it to **Enabled BypassPerfRequirement** (this ensures Chrome downloads the model regardless of hardware constraints).

3. Click the blue **Relaunch** button at the bottom of Chrome.

4. Open:
   ```text
   chrome://components
   ```
   Find **Optimization Guide On Device Model**. If the version is `0.0.0.0`, click **Check for update** to begin the one-time local model download (~1-2 GB).

---

## 🖥️ On-Screen Floating HUD Widget

While browsing [x.com](https://x.com), a sleek floating widget provides instant control without opening the popup:
- **Engine Status Chips**: Live status and quick-switch pills for all 4 engines (`Nano`, `Cloud API`, `Headless`, and `Web`).
- **Custom Prompt Instructions**: Expanded on-screen multiline editor to define your AI personality, tone, or negative constraints (e.g., *"no emojis"*, *"keep under 180 chars"*).
- **Tone Switcher**: Instant access to reply tones and tweet archetypes.
- **Quick Post Drafter**: Draft and polish tweets from anywhere on the timeline.
- **Draggable & Collapsible**: Drag anywhere on screen or minimize to a compact badge.

---

## 🔄 Intelligent Engine Fallback

If your selected engine encounters temporary downtime, rate limits, or network errors, the extension automatically cascades through available backup engines:

$$\text{Cloud API} \longrightarrow \text{Gemini Nano} \longrightarrow \text{Headless Web} \longrightarrow \text{Gemini Web Tab}$$

This guarantees uninterrupted tweet and reply generation.

---

## 💻 How to Install the Extension on Your PC / Laptop

Anyone can install and run this extension locally in under 2 minutes:

### 1. Download or Clone the Repository
- **Via Git**:
  ```bash
  git clone https://github.com/gomedz/twitter-auto-reply.git
  ```
- **Or via ZIP**:
  - Click the green **Code** button at the top of this repository on GitHub.
  - Select **Download ZIP** and extract the folder to your preferred location.

### 2. Load the Extension into Google Chrome
1. Open Google Chrome.
2. Type `chrome://extensions/` in the address bar and hit `Enter`.
3. In the top-right corner, turn ON the **Developer mode** toggle.
4. In the top-left corner, click the **Load unpacked** button.
5. In the file picker, select the folder containing `manifest.json` (the extracted/cloned folder).
6. The extension **"Twitter AI Assistant (Reply & Post Creator)"** is now installed! Pin it to your Chrome toolbar for quick access.

---

## 🚀 How to Use on Twitter (X)

### 1. Auto-Replying to Tweets ("✦ AI Reply")
- Open any tweet or thread on [x.com](https://x.com).
- Click into the reply box or open the reply dialog.
- The button will automatically show **"✦ AI Reply ▾"**.
- Click **AI Reply** to generate with your default tone, or click `▾` to choose a specific tone (*Quick*, *Agree*, *Thoughtful*, *Witty*, *Question*, *Counter-Point*).
- The AI crafts the response and auto-inserts it directly into the reply box!

### 2. Creating New Posts ("✦ AI Post")
- Click into the *"What is happening?!"* box at the top of your feed, or click the sidebar **Post** button.
- The button automatically adapts to **"✦ AI Post ▾"**.
- **Draft Polish Mode**: Type your raw thoughts, bullet points, or draft into the box, then click **AI Post** (or pick a style like *Engaging Hook* or *Insight & Value*) to polish and optimize it.
- **Topic Prompt Mode**: If the box is empty, clicking **AI Post** pops up a prompt bar asking for your topic or idea! Enter your thought and hit **Generate ✦** to have it typed into the box.

### 3. Standalone Popup Post Creator
- Click the extension icon in Chrome and switch to the **✍️ Post Creator** tab.
- Enter any topic or prompt, select your preferred post style, and click **Generate Tweet ✦**.
- Preview, edit, copy to clipboard, or click **Post on X ↗** to open a new tweet ready to send!

---

## 🛡️ Privacy & Security

- **No Paid Subscriptions Required**: Run 100% free with local Gemini Nano, Headless Google cookie session, or Google AI Studio's free API tier.
- **Local & Private (Nano)**: When using Gemini Nano, inference happens 100% locally on your machine without transmitting any data over the internet.
- **Secure Direct Cloud Calls**: When using Cloud API, requests travel directly from your browser to Google's official endpoint (`generativelanguage.googleapis.com`). Your API key is stored strictly in your local Chrome extension storage (`chrome.storage.local`).
- **No Third-Party Intermediaries**: No passwords or account credentials are ever logged, and zero data passes through third-party servers.

---

## ☕ Support Us

**If you found this project helpful, consider buying me a coffee!**
- Trakteer ID: [teer.id/gmd.inc](https://teer.id/gmd.inc)
- Buy me a coffee: [buymeacoffee.com/gmd.inc](https://www.buymeacoffee.com/gmd.inc)
- Crypto: `0x8cD08357a2a56ed90D0137AE7bee324bd772B90d`

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
