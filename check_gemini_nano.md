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
