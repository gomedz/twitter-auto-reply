// offscreen.js - Runs Chrome Built-in Gemini Nano in a full Window context

console.log('[Twitter-AI-Reply] Offscreen Gemini Nano document loaded.');

// Check if Gemini Nano is available
async function checkNanoAvailability() {
  if (typeof LanguageModel !== 'undefined') {
    try {
      const availability = await LanguageModel.availability({
        expectedInputs: [{ type: "text", languages: ["en"] }],
        expectedOutputs: [{ type: "text", languages: ["en"] }]
      });
      const isReady = availability === 'readily' || availability === 'available';
      const isSupported = availability !== 'no' && availability !== 'unavailable';
      const needsDownload = availability === 'after-download' || availability === 'downloadable';
      return {
        available: isSupported,
        isReady: isReady,
        needsDownload: needsDownload,
        status: availability,
        api: 'LanguageModel'
      };
    } catch (e) {
      try {
        const availability = await LanguageModel.availability();
        const isReady = availability === 'readily' || availability === 'available';
        const isSupported = availability !== 'no' && availability !== 'unavailable';
        const needsDownload = availability === 'after-download' || availability === 'downloadable';
        return {
          available: isSupported,
          isReady: isReady,
          needsDownload: needsDownload,
          status: availability,
          api: 'LanguageModel'
        };
      } catch (innerErr) {
        return {
          available: false,
          isReady: false,
          needsDownload: false,
          status: 'unavailable',
          error: innerErr.message,
          api: 'LanguageModel'
        };
      }
    }
  }

  if (typeof window.ai !== 'undefined' && window.ai.languageModel) {
    try {
      const cap = await window.ai.languageModel.capabilities();
      const isAvailable = cap.available !== 'no';
      const isReady = cap.available === 'readily';
      const needsDownload = cap.available === 'after-download';
      return {
        available: isAvailable,
        isReady: isReady,
        needsDownload: needsDownload,
        status: cap.available,
        api: 'window.ai'
      };
    } catch (e) {
      return {
        available: false,
        isReady: false,
        needsDownload: false,
        status: 'unavailable',
        error: e.message,
        api: 'window.ai'
      };
    }
  }

  return {
    available: false,
    isReady: false,
    needsDownload: false,
    status: 'unavailable',
    api: 'none',
    message: 'Prompt API not detected. Please ensure chrome://flags/#prompt-api-for-gemini-nano is enabled.'
  };
}

// Generate prompt with Gemini Nano
async function runNanoPrompt(promptText, customSystemPrompt = null) {
  const systemContent = customSystemPrompt || 'You are an authentic Twitter (X) assistant. Keep tweets and replies concise, under 260 characters, natural, no hashtags, no quotes.';

  if (typeof LanguageModel !== 'undefined' && typeof LanguageModel.create === 'function') {
    try {
      const session = await LanguageModel.create({
        initialPrompts: [
          { role: 'system', content: systemContent }
        ]
      });
      try {
        const reply = await session.prompt(promptText);
        return reply;
      } finally {
        if (session.destroy) session.destroy();
      }
    } catch (langModelErr) {
      console.warn('[Offscreen] LanguageModel.create failed, attempting window.ai fallback:', langModelErr);
    }
  }

  if (typeof window.ai !== 'undefined' && window.ai.languageModel && typeof window.ai.languageModel.create === 'function') {
    const session = await window.ai.languageModel.create({
      systemPrompt: systemContent
    });
    try {
      const reply = await session.prompt(promptText);
      return reply;
    } finally {
      if (session.destroy) session.destroy();
    }
  }

  throw new Error('Neither LanguageModel nor window.ai is available or ready in this Chrome build.');
}

// Message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== 'offscreen') return false;

  if (message.type === 'NANO_CHECK_AVAILABILITY') {
    checkNanoAvailability().then(sendResponse);
    return true;
  }

  if (message.type === 'NANO_GENERATE_PROMPT') {
    (async () => {
      try {
        const reply = await runNanoPrompt(message.prompt, message.systemPrompt);
        sendResponse({ success: true, reply });
      } catch (err) {
        console.error('[Offscreen] Nano generation error:', err);
        sendResponse({
          success: false,
          error: err.message || 'Gemini Nano generation failed.'
        });
      }
    })();
    return true;
  }
});
