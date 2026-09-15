// background.js - Multi-Engine Service Worker for Twitter AI Auto Reply
// Supports:
// 1. 'nano': Chrome Built-in Gemini Nano (0 tabs, local GPU, Prompt API)
// 2. 'headless': Direct Web Request with Google Cookies (0 tabs, background fetch)
// 3. 'web_tab': Gemini Web Tab DOM Automation (with optional auto-close)

const GEMINI_URL = 'https://gemini.google.com/app';

// Default settings
const DEFAULT_SETTINGS = {
  engine: 'nano', // 'nano' | 'headless' | 'web_tab'
  defaultTone: 'quick',
  customInstructions: 'Keep reply concise, under 260 characters. No hashtags. No quotation marks around the reply. Be natural and conversational.',
  autoOpenGemini: true,
  autoCloseTab: true
};

// Initialize settings & declarative rules on install / startup
async function setupExtension() {
  const existing = await chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS));
  const toSet = {};
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    if (existing[k] === undefined) {
      toSet[k] = v;
    }
  }
  if (Object.keys(toSet).length > 0) {
    await chrome.storage.local.set(toSet);
  }

  // Ensure request headers for headless Gemini calls mimic same-origin
  if (chrome.declarativeNetRequest) {
    try {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [1001],
        addRules: [
          {
            id: 1001,
            priority: 1,
            action: {
              type: 'modifyHeaders',
              requestHeaders: [
                { header: 'Origin', operation: 'set', value: 'https://gemini.google.com' },
                { header: 'Referer', operation: 'set', value: 'https://gemini.google.com/app' },
                { header: 'X-Same-Domain', operation: 'set', value: '1' }
              ]
            },
            condition: {
              urlFilter: 'https://gemini.google.com/_/BardChatUi/*',
              resourceTypes: ['xmlhttprequest', 'other']
            }
          }
        ]
      });
    } catch (e) {
      console.warn('[Background] DNR rule update warning:', e);
    }
  }
}

chrome.runtime.onInstalled.addListener(setupExtension);
chrome.runtime.onStartup.addListener(setupExtension);

// ==========================================
// OFFSCREEN DOCUMENT MANAGEMENT (FOR NANO)
// ==========================================
let creatingOffscreen = null;

async function ensureOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT']
  });

  if (existingContexts && existingContexts.length > 0) {
    return;
  }

  if (creatingOffscreen) {
    await creatingOffscreen;
  } else {
    creatingOffscreen = chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['DOM_SCRAPING'],
      justification: 'Running on-device Gemini Nano Prompt API'
    });
    await creatingOffscreen;
    creatingOffscreen = null;
  }
}

// Check Nano availability
async function checkNanoStatus() {
  try {
    if (typeof LanguageModel !== 'undefined') {
      try {
        const avail = await LanguageModel.availability({
          expectedInputs: [{ type: "text", languages: ["en"] }],
          expectedOutputs: [{ type: "text", languages: ["en"] }]
        });
        return { available: avail !== 'unavailable', status: avail, api: 'LanguageModel (Worker)' };
      } catch (e) {
        return { available: true, status: 'ready', api: 'LanguageModel (Worker)' };
      }
    }

    await ensureOffscreenDocument();
    const resp = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ target: 'offscreen', type: 'NANO_CHECK_AVAILABILITY' }, resolve);
    });
    return resp || { available: false, status: 'unavailable', message: 'No response from offscreen document.' };
  } catch (err) {
    return { available: false, status: 'unavailable', error: err.message };
  }
}

// Generate via Gemini Nano
async function generateViaNano(promptText) {
  if (typeof LanguageModel !== 'undefined') {
    const session = await LanguageModel.create({
      initialPrompts: [
        { role: 'system', content: 'You are an authentic Twitter reply assistant. Keep replies concise, under 260 characters, no hashtags, no quotes.' }
      ]
    });
    try {
      const reply = await session.prompt(promptText);
      return reply;
    } finally {
      if (session.destroy) session.destroy();
    }
  }

  await ensureOffscreenDocument();
  const resp = await new Promise((resolve) => {
    chrome.runtime.sendMessage({
      target: 'offscreen',
      type: 'NANO_GENERATE_PROMPT',
      prompt: promptText
    }, resolve);
  });

  if (!resp || !resp.success) {
    throw new Error(resp?.error || 'Gemini Nano generation failed.');
  }

  return resp.reply;
}

// ==========================================
// ENGINE 2: HEADLESS WEB FETCH (COOKIES)
// ==========================================
let cachedTokens = { at: null, fdr: null, bl: null, timestamp: 0 };

async function getCachedSessionTokens() {
  if (cachedTokens.at && Date.now() - cachedTokens.timestamp < 300000) {
    return cachedTokens;
  }
  try {
    if (chrome.storage?.session) {
      const data = await chrome.storage.session.get('headlessTokens');
      if (data?.headlessTokens?.at && Date.now() - data.headlessTokens.timestamp < 300000) {
        cachedTokens = data.headlessTokens;
        return cachedTokens;
      }
    }
  } catch (e) {
    console.warn('[Background] chrome.storage.session read error:', e);
  }
  return null;
}

async function setCachedSessionTokens(tokens) {
  cachedTokens = tokens;
  try {
    if (chrome.storage?.session) {
      await chrome.storage.session.set({ headlessTokens: tokens });
    }
  } catch (e) {
    console.warn('[Background] chrome.storage.session write error:', e);
  }
}

async function getHeadlessSessionTokens() {
  const cached = await getCachedSessionTokens();
  if (cached) {
    return cached;
  }

  const res = await fetch('https://gemini.google.com/app', {
    credentials: 'include'
  });

  if (!res.ok) {
    throw new Error(`Failed to load Gemini page (HTTP ${res.status}). Ensure you are logged into Google.`);
  }

  const html = await res.text();

  const atMatch = html.match(/"SNlM0e":"([^"]+)"/);
  const fdrMatch = html.match(/"FdrFJe":"([^"]+)"/);
  const blMatch = html.match(/"cfb2h":"([^"]+)"/);

  if (!atMatch || !atMatch[1]) {
    throw new Error('Google session token (SNlM0e) not found. Please ensure you are logged into gemini.google.com in Chrome.');
  }

  const tokens = {
    at: atMatch[1],
    fdr: fdrMatch ? fdrMatch[1] : '',
    bl: blMatch ? blMatch[1] : 'boq_assistant-bard-web-server_20240501.00_p0',
    timestamp: Date.now()
  };

  await setCachedSessionTokens(tokens);
  return tokens;
}

async function generateViaHeadless(promptText) {
  const tokens = await getHeadlessSessionTokens();

  // Modern Batchexecute RPC payload for Gemini
  const reqData = [
    [promptText, 0, null, null, null, null, 0],
    ["en"],
    ["", "", ""],
    null,
    null,
    null,
    [0],
    0,
    [],
    [],
    null,
    0,
    0
  ];

  const envelope = [
    [
      ["assistant.lamda.BardFrontendService/StreamGenerate", JSON.stringify(reqData), null, "generic"]
    ]
  ];

  const bodyParams = new URLSearchParams();
  bodyParams.append('f.req', JSON.stringify(envelope));
  bodyParams.append('at', tokens.at);

  const reqId = Math.floor(Math.random() * 900000) + 100000;
  const reqUrl = `https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate?bl=${encodeURIComponent(tokens.bl)}&_reqid=${reqId}&rt=c`;

  const response = await fetch(reqUrl, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
    },
    body: bodyParams.toString()
  });

  if (!response.ok) {
    throw new Error(`Headless Gemini request returned HTTP ${response.status}`);
  }

  const rawText = await response.text();

  // Search for longest non-code string inside quotes
  const stringRegex = /"([^"\\]*(?:\\.[^"\\]*)*)"/g;
  let m;
  let maxLen = 0;
  let candidate = '';
  while ((m = stringRegex.exec(rawText)) !== null) {
    const unescaped = m[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
    if (unescaped.length > maxLen && unescaped.length < 1000 && !unescaped.startsWith('http') && !unescaped.startsWith('boq_')) {
      if (!unescaped.includes('BardFrontendService') && !unescaped.includes('SNlM0e')) {
        maxLen = unescaped.length;
        candidate = unescaped;
      }
    }
  }

  if (!candidate) {
    throw new Error('Could not parse text reply from headless stream.');
  }

  return candidate;
}

// ==========================================
// ENGINE 3: GEMINI WEB TAB (DOM AUTOMATION)
// ==========================================
async function findGeminiTab() {
  const tabs = await chrome.tabs.query({ url: 'https://gemini.google.com/*' });
  if (!tabs || tabs.length === 0) return null;
  const appTab = tabs.find(t => t.url && t.url.includes('/app'));
  return appTab || tabs[0];
}

// Wait until Gemini tab completes loading and has rendered its prompt input
async function waitForGeminiTabReady(tabId, timeoutMs = 25000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab && tab.status === 'complete') {
        const status = await sendToGeminiTab(tabId, { type: 'CHECK_AUTH_STATUS' }, 2000);
        if (status && (status.hasInput || status.hasChatUI)) {
          return true;
        }
      }
    } catch (e) {
      // Tab loading, redirecting, or script not injected yet
    }
    await new Promise(r => setTimeout(r, 400));
  }
  return false;
}

async function openGeminiTab(inBackground = false) {
  const tab = await chrome.tabs.create({
    url: GEMINI_URL,
    active: !inBackground
  });

  const isReady = await waitForGeminiTabReady(tab.id, 25000);
  if (!isReady) {
    console.warn('[Background] Gemini tab took longer than expected to report ready.');
  }
  return tab;
}

function sendMessageOnce(tabId, message, timeoutMs) {
  return new Promise((resolve, reject) => {
    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        reject(new Error('Timeout waiting for Gemini response.'));
      }
    }, timeoutMs);

    chrome.tabs.sendMessage(tabId, message, (response) => {
      clearTimeout(timer);
      if (resolved) return;
      resolved = true;

      if (chrome.runtime.lastError) {
        return reject(new Error(chrome.runtime.lastError.message || 'Could not communicate with tab.'));
      }
      resolve(response);
    });
  });
}

async function sendToGeminiTab(tabId, message, timeoutMs = 30000) {
  try {
    return await sendMessageOnce(tabId, message, timeoutMs);
  } catch (err) {
    const isConnErr = err.message && (
      err.message.includes('Receiving end does not exist') ||
      err.message.includes('Could not establish connection')
    );

    if (isConnErr && chrome.scripting) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['content_gemini.js']
        });
        await new Promise(r => setTimeout(r, 400));
        return await sendMessageOnce(tabId, message, timeoutMs);
      } catch (injectErr) {
        throw err;
      }
    }
    throw err;
  }
}

async function generateViaWebTab(promptText) {
  const settings = await chrome.storage.local.get(['autoOpenGemini', 'autoCloseTab']);
  let geminiTab = await findGeminiTab();
  let createdNewTab = false;
  let callerTab = null;

  if (!geminiTab) {
    if (settings.autoOpenGemini === false) {
      throw new Error('Gemini tab is not open. Please open gemini.google.com/app or choose Gemini Nano engine.');
    }

    // Save current active tab (e.g. Twitter) so we can keep user focused there
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      callerTab = activeTab;
    } catch (e) {}

    // Open Gemini tab active so Chrome hydrates Angular/Lit at full speed (no background throttling)
    geminiTab = await chrome.tabs.create({
      url: GEMINI_URL,
      active: true
    });
    createdNewTab = true;

    // Wait until Gemini has mounted its prompt input box
    const isReady = await waitForGeminiTabReady(geminiTab.id, 25000);
    if (!isReady) {
      throw new Error('Gemini tab took too long to load. Please ensure you are logged into gemini.google.com/app.');
    }

    // Immediately restore the caller tab as active so the user stays on Twitter!
    if (callerTab) {
      try {
        await chrome.tabs.update(callerTab.id, { active: true });
      } catch (e) {}
    }
  }

  try {
    const geminiResult = await sendToGeminiTab(geminiTab.id, {
      type: 'EXECUTE_PROMPT',
      prompt: promptText
    }, 45000);

    if (!geminiResult || geminiResult.error) {
      throw new Error(geminiResult?.message || 'Gemini encountered an error.');
    }

    // If we opened a temporary tab and auto-close is enabled (default true), close it!
    if (createdNewTab && settings.autoCloseTab !== false) {
      try {
        await chrome.tabs.remove(geminiTab.id);
      } catch (e) {}
    }

    return geminiResult.reply;
  } catch (err) {
    if (createdNewTab && settings.autoCloseTab !== false) {
      try {
        await chrome.tabs.remove(geminiTab.id);
      } catch (e) {}
    }
    throw err;
  }
}

// ==========================================
// RESILIENT MULTI-ENGINE FALLBACK PIPELINE
// ==========================================
async function executeWithFallback(engine, promptText) {
  // 1. Try selected engine
  try {
    if (engine === 'nano') {
      const reply = await generateViaNano(promptText);
      return { reply, engine: 'Gemini Nano' };
    }
    if (engine === 'headless') {
      const reply = await generateViaHeadless(promptText);
      return { reply, engine: 'Headless Web' };
    }
    const reply = await generateViaWebTab(promptText);
    return { reply, engine: 'Gemini Web Tab' };
  } catch (primaryErr) {
    console.warn(`[Background] Primary engine '${engine}' failed:`, primaryErr);

    // 2. If headless failed, try Nano next if available
    if (engine === 'headless') {
      try {
        const nanoStatus = await checkNanoStatus();
        if (nanoStatus.available) {
          console.log('[Background] Headless failed, falling back to Gemini Nano.');
          const reply = await generateViaNano(promptText);
          return { reply, engine: 'Gemini Nano (fallback)' };
        }
      } catch (nanoErr) {
        console.warn('[Background] Fallback to Gemini Nano failed:', nanoErr);
      }
    }

    // 3. Fallback to Web Tab for both nano and headless
    if (engine === 'nano' || engine === 'headless') {
      console.log('[Background] Falling back to Gemini Web Tab.');
      try {
        const reply = await generateViaWebTab(promptText);
        return { reply, engine: 'Gemini Web Tab (fallback)' };
      } catch (tabErr) {
        console.error('[Background] Web Tab fallback also failed:', tabErr);
        throw new Error(`All AI generation engines failed. Primary (${engine}) error: ${primaryErr.message}. Fallback error: ${tabErr.message}`);
      }
    }

    throw primaryErr;
  }
}

// ==========================================
// CENTRAL MESSAGE ROUTER
// ==========================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target === 'offscreen') return false;

  (async () => {
    try {
      // 1. Check Engine Status
      if (message.type === 'CHECK_ENGINE_STATUS') {
        const { engine = 'nano' } = await chrome.storage.local.get(['engine']);

        if (engine === 'nano') {
          const nanoStatus = await checkNanoStatus();
          return sendResponse({
            engine: 'nano',
            connected: nanoStatus.available,
            statusText: nanoStatus.available ? 'Ready (Local AI)' : 'Nano Unavailable',
            message: nanoStatus.available
              ? 'Chrome Built-in Gemini Nano is ready. 0 tabs needed!'
              : 'Gemini Nano not enabled. Check chrome://flags or switch engine.',
            details: nanoStatus
          });
        }

        if (engine === 'headless') {
          try {
            const tokens = await getHeadlessSessionTokens();
            return sendResponse({
              engine: 'headless',
              connected: !!tokens.at,
              statusText: 'Ready (Cookies)',
              message: 'Authenticated via Google login cookies. 0 tabs needed!'
            });
          } catch (e) {
            return sendResponse({
              engine: 'headless',
              connected: false,
              statusText: 'Not Logged In',
              message: e.message || 'Could not verify Google login session.'
            });
          }
        }

        // Default: 'web_tab'
        const geminiTab = await findGeminiTab();
        if (!geminiTab) {
          return sendResponse({
            engine: 'web_tab',
            connected: false,
            tabExists: false,
            statusText: 'Tab Closed',
            message: 'No open Gemini tab found. Click "Open Gemini" to connect.'
          });
        }

        try {
          const status = await sendToGeminiTab(geminiTab.id, { type: 'CHECK_AUTH_STATUS' }, 5000);
          const isConnected = !!status?.loggedIn;
          return sendResponse({
            engine: 'web_tab',
            connected: isConnected,
            tabExists: true,
            tabId: geminiTab.id,
            statusText: isConnected ? 'Ready (Web Tab)' : 'Sync Needed',
            message: isConnected ? 'Gemini Web tab active & ready.' : 'Gemini tab open. Login needed.'
          });
        } catch (err) {
          return sendResponse({
            engine: 'web_tab',
            connected: false,
            tabExists: true,
            statusText: 'Not Responding',
            message: 'Gemini tab open but not responding. Refresh it.'
          });
        }
      }

      // 2. Open Gemini Tab
      if (message.type === 'OPEN_GEMINI') {
        let geminiTab = await findGeminiTab();
        if (geminiTab) {
          if (geminiTab.url && !geminiTab.url.includes('/app')) {
            await chrome.tabs.update(geminiTab.id, { url: GEMINI_URL, active: true });
          } else {
            await chrome.tabs.update(geminiTab.id, { active: true });
          }
          if (geminiTab.windowId) {
            await chrome.windows.update(geminiTab.windowId, { focused: true });
          }
        } else {
          geminiTab = await openGeminiTab(false);
        }
        return sendResponse({ success: true, tabId: geminiTab.id });
      }

      // 3. Generate Reply (Supports All 3 Engines with Smooth Auto-Fallback)
      if (message.type === 'GENERATE_REPLY') {
        const settings = await chrome.storage.local.get(['engine', 'customInstructions']);
        const engine = settings.engine || 'nano';
        const promptText = buildGeminiPrompt({
          ...message.payload,
          customInstructions: settings.customInstructions || message.payload.customInstructions
        });

        const result = await executeWithFallback(engine, promptText);

        return sendResponse({
          success: true,
          reply: cleanGeneratedReply(result.reply),
          engine: result.engine
        });
      }

      sendResponse({ success: false, error: 'UNKNOWN_TYPE' });
    } catch (globalError) {
      console.error('[Background] Error:', globalError);
      sendResponse({
        success: false,
        error: 'INTERNAL_ERROR',
        message: globalError.message
      });
    }
  })();

  return true;
});

// Prompt Builder
function buildGeminiPrompt({ tweetText, tweetAuthor, tone, customInstructions }) {
  const toneDescriptions = {
    quick: 'natural, friendly, and relevant',
    agree: 'supportive, validating, and constructive',
    thoughtful: 'intellectual, thoughtful, adding valuable perspective',
    funny: 'witty, humorous, and clever with a lighthearted touch',
    question: 'asking an engaging, open-ended question to spark conversation',
    debate: 'respectfully offering an alternate viewpoint or counter-argument'
  };

  const selectedTone = toneDescriptions[tone] || toneDescriptions.quick;
  const authorMention = tweetAuthor ? ` by @${tweetAuthor}` : '';

  return `You are crafting an authentic Twitter (X) reply.

Tweet being replied to${authorMention}:
"""
${tweetText}
"""

Tone: ${selectedTone}.
Instructions:
- Write ONLY the exact text of the reply.
- Under 260 characters.
- Do NOT wrap in quotes.
- Do NOT include hashtags or intro phrases like "Here is a reply:".
${customInstructions ? `- Extra guideline: ${customInstructions}` : ''}`;
}

// Cleaner
function cleanGeneratedReply(rawText) {
  if (!rawText) return '';
  let text = rawText.trim();
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith('“') && text.endsWith('”'))) {
    text = text.slice(1, -1).trim();
  }
  text = text.replace(/^(Reply:\s*|Here's a reply:\s*|Twitter reply:\s*)/i, '').trim();
  return text;
}
