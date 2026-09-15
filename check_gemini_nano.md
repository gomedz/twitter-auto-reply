# How to Check & Enable Gemini Nano in Google Chrome

This guide helps you verify if your PC/laptop and Google Chrome browser support **Gemini Nano (Chrome Built-in On-Device AI)**.

---

## 🔍 1. Quick 5-Second Console Test

1. Open any webpage in Chrome.
2. Press `F12` (or right-click anywhere and select **Inspect**), then click the **Console** tab.
3. Paste the following line and press `Enter`:
   ```javascript
   'LanguageModel' in window || 'ai' in window
   ```
4. **If it returns `true`**: 🎉 Gemini Nano is supported and ready on your browser!
5. **If it returns `false`**: Follow the simple steps below to enable it.

---

## 🛠️ 2. How to Enable Gemini Nano in Chrome

### Step 1: Enable Chrome Flags
1. Open a new tab in Chrome and navigate to:
   ```text
   chrome://flags/#prompt-api-for-gemini-nano
   ```
   Set it to **Enabled**.

2. Next, navigate to:
   ```text
   chrome://flags/#optimization-guide-on-device-model
   ```
   Set it to **Enabled BypassPerfRequirement** (this ensures Chrome downloads the model regardless of hardware constraints).

3. Click the blue **Relaunch** button at the bottom of Chrome.

---

### Step 2: Download the Local AI Component
1. In Chrome's address bar, navigate to:
   ```text
   chrome://components
   ```
2. Scroll down to find **Optimization Guide On Device Model**.
3. If the version is `0.0.0.0` (or not yet downloaded):
   - Click the **Check for update** button.
   - Chrome will begin downloading the local model (~1-2 GB).
   - Once it finishes and displays a version number, your browser is ready!

---

## 🚀 3. Test It in the Extension
1. Click the **Twitter AI Auto Reply** extension icon in your toolbar.
2. Under **AI Engine**, select **⚡ Gemini Nano (Local AI)**.
3. In the **Test Selected Engine** box at the bottom, enter a sample tweet and click **Generate**.
4. You should see instant local AI replies!
