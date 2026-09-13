# Twitter (X) AI Auto Reply Chrome Extension

Generate intelligent, contextual, and authentic auto-replies directly on **Twitter (X)** without requiring any developer API keys.

---

## 🌟 Supported AI Engines

You can choose your preferred engine anytime with one click in the extension popup:

1. **⚡ Gemini Nano (Built-in On-Device AI)** *(Recommended)*:
   - **0 tabs opened**.
   - Runs directly inside Chrome using your computer's local hardware (GPU/NPU).
   - 100% private, works offline, and generates replies in under a second.
2. **🌐 Headless Web (Google Cookie Session)**:
   - **0 tabs opened**.
   - Sends silent background requests directly using your active Google login session cookies.
3. **🗂️ Gemini Web Tab (DOM Automation)**:
   - Automates the real [gemini.google.com/app](https://gemini.google.com/app) chat interface.
   - Includes an **Auto-close tab** toggle so temporary background tabs vanish automatically once the reply is pasted.

---

## 🔍 How to Check if Gemini Nano is Supported in Your Chrome

Before using **Option 1 (Gemini Nano)**, verify if your Chrome browser supports on-device AI:

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
6. The extension **"Twitter AI Auto Reply (Gemini Web)"** is now installed! Pin it to your Chrome toolbar for quick access.

---

## 🚀 How to Use on Twitter (X)

1. **Configure Your Engine**:
   - Click the extension icon in your Chrome toolbar.
   - Choose your preferred AI Engine (e.g. **⚡ Gemini Nano**).
   - Customize your default tone (*Quick*, *Agree*, *Thoughtful*, *Witty*, *Question*, *Counter-Point*) or add custom instructions (e.g., *"Keep it under 150 characters"*).
2. **Go to Twitter (X)**:
   - Open [x.com](https://x.com) or [twitter.com](https://twitter.com).
   - Click the **Reply** icon on any tweet or click into an inline reply box.
3. **Generate & Reply**:
   - You will see the **"✦ AI Reply ▾"** button directly inside the composer toolbar right next to the Reply button.
   - Click **AI Reply** (or click the arrow `▾` to choose a specific tone).
   - The AI will craft the reply and automatically insert it into your Twitter reply box, activating Twitter's native **Reply** button ready for sending!

---

## 🛡️ Privacy & Security

- **No API Keys Needed**: Operates without any third-party or paid API credentials.
- **Local & Private**: When using Gemini Nano, inference happens 100% locally on your machine without transmitting any data over the internet.
- **No Credentials Stored**: No passwords, tokens, or Google account credentials are ever logged, stored, or sent to external servers.

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
