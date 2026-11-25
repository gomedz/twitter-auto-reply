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
        // Fall through to ai.languageModel check
      }
    }
  }

  const aiObj = (typeof window !== 'undefined' ? window.ai : null) || (typeof self !== 'undefined' ? self.ai : null);
  if (aiObj && aiObj.languageModel) {
    if (typeof aiObj.languageModel.availability === 'function') {
      try {
        const langOpts = {
          expectedInputs: [{ type: 'text', languages: ['en'] }],
          expectedOutputs: [{ type: 'text', languages: ['en'] }]
        };
        let availability;
        try {
          availability = await aiObj.languageModel.availability(langOpts);
        } catch (eOpts) {
          availability = await aiObj.languageModel.availability();
        }
        const isReady = availability === 'readily' || availability === 'available';
        const isSupported = availability !== 'no' && availability !== 'unavailable';
        const needsDownload = availability === 'after-download' || availability === 'downloadable';
        return {
          available: isSupported,
          isReady: isReady,
          needsDownload: needsDownload,
          status: availability,
          api: 'ai.languageModel'
        };
      } catch (e) {}
    }

    if (typeof aiObj.languageModel.capabilities === 'function') {
      try {
        const langOpts = {
          expectedInputs: [{ type: 'text', languages: ['en'] }],
          expectedOutputs: [{ type: 'text', languages: ['en'] }]
        };
        let cap;
        try {
          cap = await aiObj.languageModel.capabilities(langOpts);
        } catch (eOpts) {
          cap = await aiObj.languageModel.capabilities();
        }
        const isAvailable = cap.available !== 'no';
        const isReady = cap.available === 'readily';
        const needsDownload = cap.available === 'after-download';
        return {
          available: isAvailable,
          isReady: isReady,
          needsDownload: needsDownload,
          status: cap.available,
          api: 'ai.languageModel'
        };
      } catch (e) {
        return {
          available: false,
          isReady: false,
          needsDownload: false,
          status: 'unavailable',
          error: e.message,
          api: 'ai.languageModel'
        };
      }
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

  // 1. Try global LanguageModel (supports modern language attestation + initialPrompts/systemPrompt)
  if (typeof LanguageModel !== 'undefined' && typeof LanguageModel.create === 'function') {
    let session = null;
    const langOpts = {
      expectedInputs: [{ type: 'text', languages: ['en'] }],
      expectedOutputs: [{ type: 'text', languages: ['en'] }]
    };

    try {
      session = await LanguageModel.create({
        initialPrompts: [{ role: 'system', content: systemContent }],
        ...langOpts
      });
    } catch (e1) {
      try {
        session = await LanguageModel.create({
          systemPrompt: systemContent,
          ...langOpts
        });
      } catch (e2) {
        try {
          session = await LanguageModel.create({
            initialPrompts: [{ role: 'system', content: systemContent }]
          });
        } catch (e3) {
          try {
            session = await LanguageModel.create({
              systemPrompt: systemContent
            });
          } catch (e4) {
            console.warn('[Offscreen] LanguageModel.create failed across all spec variants:', e1, e2, e3, e4);
          }
        }
      }
    }

    if (session) {
      try {
        const reply = await session.prompt(promptText);
        return reply;
      } finally {
        if (session.destroy) session.destroy();
      }
    }
  }

  // 2. Try window.ai / self.ai languageModel
  const aiObj = (typeof window !== 'undefined' ? window.ai : null) || (typeof self !== 'undefined' ? self.ai : null);
  if (aiObj && aiObj.languageModel && typeof aiObj.languageModel.create === 'function') {
    let session = null;
    const langOpts = {
      expectedInputs: [{ type: 'text', languages: ['en'] }],
      expectedOutputs: [{ type: 'text', languages: ['en'] }]
    };

    try {
      session = await aiObj.languageModel.create({
        systemPrompt: systemContent,
        ...langOpts
      });
    } catch (e1) {
      try {
        session = await aiObj.languageModel.create({
          initialPrompts: [{ role: 'system', content: systemContent }],
          ...langOpts
        });
      } catch (e2) {
        try {
          session = await aiObj.languageModel.create({
            systemPrompt: systemContent
          });
        } catch (e3) {
          try {
            session = await aiObj.languageModel.create({
              initialPrompts: [{ role: 'system', content: systemContent }]
            });
          } catch (e4) {
            console.warn('[Offscreen] ai.languageModel.create failed:', e1, e2, e3, e4);
          }
        }
      }
    }

    if (session) {
      try {
        const reply = await session.prompt(promptText);
        return reply;
      } finally {
        if (session.destroy) session.destroy();
      }
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
