// background.js - Multi-Engine Service Worker for Twitter AI Auto Reply
// Supports:
// 1. 'nano': Chrome Built-in Gemini Nano (0 tabs, local GPU, Prompt API)
// 2. 'cloud_api': Google Gemini Cloud REST API (0 tabs, free API key, 1.5-flash / 2.0-flash / 1.5-pro)
// 3. 'headless': Direct Web Request with Google Cookies (0 tabs, background fetch)
// 4. 'web_tab': Gemini Web Tab DOM Automation (with optional auto-close)

const GEMINI_URL = 'https://gemini.google.com/app';

// Default settings
const DEFAULT_SETTINGS = {
  engine: 'cloud_api', // 'cloud_api' | 'nano' | 'headless' | 'web_tab'
  defaultTone: 'quick',
  defaultPostStyle: 'engaging',
  customInstructions: 'Keep output concise, under 260 characters. No hashtags. No quotation marks. Be natural, authentic, and human.',
  autoOpenGemini: true,
  autoCloseTab: true,
  showFloatingHud: true,
  apiKey: '',
  cloudModel: 'gemini-3.1-flash-lite',
  cloudApiVersion: 'v1beta'
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
  if (chrome.offscreen && typeof chrome.offscreen.hasDocument === 'function') {
    if (await chrome.offscreen.hasDocument()) return;
  } else if (chrome.runtime.getContexts) {
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT']
    });
    if (existingContexts && existingContexts.length > 0) {
      return;
    }
  }

  if (creatingOffscreen) {
    await creatingOffscreen;
  } else {
    try {
      creatingOffscreen = chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['DOM_SCRAPING'],
        justification: 'Running on-device Gemini Nano Prompt API'
      });
      await creatingOffscreen;
    } finally {
      creatingOffscreen = null;
    }
  }
}

// Check Nano availability
async function checkNanoStatus() {
  try {
    await ensureOffscreenDocument();
    const resp = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ target: 'offscreen', type: 'NANO_CHECK_AVAILABILITY' }, (res) => {
        if (chrome.runtime.lastError) {
          resolve({ available: false, isReady: false, status: 'unavailable', error: chrome.runtime.lastError.message });
        } else {
          resolve(res || { available: false, isReady: false, status: 'unavailable', message: 'No response from offscreen document.' });
        }
      });
    });
    return resp;
  } catch (err) {
    return { available: false, isReady: false, status: 'unavailable', error: err.message };
  }
}

// Generate via Gemini Nano (supports reply and post modes)
async function generateViaNano(promptText, customInstructions = '', mode = 'reply') {
  let systemContent = mode === 'post'
    ? 'You are an elite Twitter (X) creator. Output ONLY the single final tweet text to post. Keep standalone tweets concise, under 260 characters, punchy, no hashtags, no quotes.'
    : 'You are an authentic Twitter (X) assistant. Output ONLY the single final reply to post. Keep tweets and replies concise, under 260 characters, natural, no hashtags, no quotes.';

  if (customInstructions) {
    systemContent += ` ABSOLUTE MANDATORY RULES (override everything else, no exceptions): ${customInstructions}`;
  }
  if (hasNoEmojiInstruction(customInstructions)) {
    systemContent += ' Absolutely NO emojis or emoticons under any circumstances. Plain text only.';
  }

  await ensureOffscreenDocument();
  const resp = await new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({
      target: 'offscreen',
      type: 'NANO_GENERATE_PROMPT',
      prompt: promptText,
      systemPrompt: systemContent
    }, (res) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message || 'Offscreen document communication error.'));
      } else {
        resolve(res);
      }
    });
  });

  if (!resp || !resp.success) {
    throw new Error(resp?.error || 'Gemini Nano generation failed.');
  }

  return resp.reply;
}


// ==========================================
// ENGINE: GOOGLE GEMINI CLOUD REST API
// Matches ai_autochat implementation
// ==========================================
async function generateViaCloudAPI(promptText, customInstructions = '', mode = 'reply') {
  const {
    apiKey = '',
    cloudModel = 'gemini-3.1-flash-lite'
  } = await chrome.storage.local.get(['apiKey', 'cloudModel']);
  const cleanKey = apiKey.trim();

  if (!cleanKey) {
    throw new Error('Gemini API key is missing. Please open extension settings and configure your Google Gemini API key.');
  }

  let targetModel = cloudModel || 'gemini-3.1-flash-lite';
  if (/gemma/i.test(targetModel)) {
    targetModel = 'gemini-3.1-flash-lite';
    await chrome.storage.local.set({ cloudModel: 'gemini-3.1-flash-lite' });
  }

  // Strict concise system instruction preventing chain-of-thought/options
  let systemInstructionText = mode === 'post'
    ? 'You are an elite Twitter (X) post creator. Output ONLY the single final tweet text to post. NEVER output brainstorming, reasoning, options (Option 1/2), notes, bullet points, or quotes. Output plain text under 260 characters.'
    : 'You are an authentic Twitter (X) reply generator. Output ONLY the single final tweet text to post. NEVER output brainstorming, reasoning, options (Option 1/2), notes, bullet points, or quotes. Output plain text under 260 characters.';

  if (customInstructions) {
    systemInstructionText += ' STRICT USER RULES: ' + customInstructions;
  }
  if (hasNoEmojiInstruction(customInstructions)) {
    systemInstructionText += ' Absolutely NO emojis. Plain text only.';
  }

  // Deduplicated candidate models to prevent quota spam
  const uniqueCandidateModels = Array.from(new Set([
    targetModel,
    'gemini-2.0-flash',
    'gemini-1.5-flash'
  ])).filter(Boolean);

  let lastErrorDetail = '';
  for (const model of uniqueCandidateModels) {
    const generationConfig = {
      temperature: 0.85,
      maxOutputTokens: 260
    };

    // For reasoning/thinking models (Gemini 2.5, 3.x), disable thinking tokens to make generation instant!
    if (/2\.5|3\./i.test(model)) {
      generationConfig.thinkingConfig = { thinkingBudget: 0 };
    }

    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [{ text: promptText }]
        }
      ],
      systemInstruction: {
        parts: [{ text: systemInstructionText }]
      },
      generationConfig
    };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(cleanKey)}`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(12000)
      });

      if (response.ok) {
        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) {
          throw new Error('Received empty response from Gemini Cloud API.');
        }
        return text.trim();
      }

      const errJson = await response.json().catch(() => ({}));
      lastErrorDetail = errJson.error?.message || `HTTP ${response.status} ${response.statusText}`;

      if (response.status === 400 && (lastErrorDetail.includes('API_KEY_INVALID') || lastErrorDetail.includes('not valid'))) {
        throw new Error(`Google API Key is invalid: ${lastErrorDetail}`);
      }
      if (response.status === 429) {
        throw new Error('Google Cloud API 1-minute rate limit reached (RPM limit). Resets in ~60s.');
      }
    } catch (fetchErr) {
      if (fetchErr.message.includes('API Key is invalid') || fetchErr.message.includes('rate limit')) {
        throw fetchErr;
      }
      lastErrorDetail = fetchErr.message;
    }
  }

  throw new Error(`Gemini Cloud API Error: ${lastErrorDetail}`);
}

// Validate Google Gemini API Key using zero-quota models.list metadata verification
async function validateCloudAPIKey(apiKey, requestedModel = 'gemini-3.1-flash-lite') {
  const cleanKey = (apiKey || '').trim();
  if (!cleanKey) {
    return { valid: false, message: 'API key is empty.' };
  }

  // Gemma models are disabled
  if (requestedModel && /gemma/i.test(requestedModel)) {
    return {
      valid: false,
      message: 'Gemma models are disabled. Please choose a Gemini model (e.g. Gemini 2.0 Flash or 1.5 Flash).'
    };
  }

  // Step 1: Verify API key validity via models.list (Consumes ZERO generation quota!)
  let availableModels = [];
  try {
    const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(cleanKey)}`);
    if (!listRes.ok) {
      const errData = await listRes.json().catch(() => ({}));
      const errMsg = errData.error?.message || `HTTP ${listRes.status}: ${listRes.statusText}`;
      if (listRes.status === 400 && (errMsg.includes('API_KEY_INVALID') || errMsg.includes('not valid'))) {
        return { valid: false, message: 'API key is not valid. Please check your key from Google AI Studio.' };
      }
      return { valid: false, message: errMsg };
    }

    const listData = await listRes.json().catch(() => ({}));
    if (Array.isArray(listData.models)) {
      availableModels = listData.models.map(m => (m.name || '').replace(/^models\//, ''));
    }
  } catch (netErr) {
    return { valid: false, message: `Network error verifying key: ${netErr.message}` };
  }

  // At this point, the API key is 100% verified with Google!
  const modelToTest = requestedModel || 'gemini-3.1-flash-lite';

  // Step 2: Test generation with selected model (with graceful RPM/quota handling)
  try {
    const testRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelToTest)}:generateContent?key=${encodeURIComponent(cleanKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'Hi' }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 20 }
        })
      }
    );

    if (testRes.ok) {
      return {
        valid: true,
        model: modelToTest,
        message: `✓ Valid & Ready! Connected to ${modelToTest}`
      };
    }

    const errData = await testRes.json().catch(() => ({}));
    const errDetail = errData.error?.message || `HTTP ${testRes.status}`;

    // If 429 RPM rate limit is reached:
    if (testRes.status === 429 || errDetail.includes('quota metric') || errDetail.includes('requests per minute')) {
      return {
        valid: true,
        model: modelToTest,
        message: `✓ Key is Valid! Note: ${modelToTest} hit Google's 1-min rate limit (RPM). Resets every 60s, or select Gemini 2.0 Flash / 1.5 Flash.`
      };
    }

    // If model not found or restricted in region:
    if (testRes.status === 404) {
      const fallback = availableModels.find(m => m.includes('flash') && !m.includes('image')) || 'gemini-2.0-flash';
      return {
        valid: true,
        model: fallback,
        message: `✓ Valid Key! Note: ${modelToTest} not enabled in region; switched to ${fallback}`
      };
    }

    return {
      valid: true,
      model: modelToTest,
      message: `✓ Valid API Key! (Status: ${errDetail.substring(0, 80)})`
    };
  } catch (genErr) {
    return {
      valid: true,
      model: modelToTest,
      message: `✓ Valid API Key! (${genErr.message})`
    };
  }
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

  const atMatch = html.match(/"SNlM0e"\s*:\s*"([^"]+)"/) || html.match(/\\"SNlM0e\\"\s*:\s*\\"([^\\"]+)\\"/);
  const fdrMatch = html.match(/"FdrFJe"\s*:\s*"([^"]+)"/) || html.match(/\\"FdrFJe\\"\s*:\s*\\"([^\\"]+)\\"/);
  const blMatch = html.match(/"cfb2h"\s*:\s*"([^"]+)"/) || html.match(/\\"cfb2h\\"\s*:\s*\\"([^\\"]+)\\"/);

  if (!atMatch || !atMatch[1]) {
    throw new Error('Google session token (SNlM0e) not found. Please ensure you are logged into gemini.google.com in Chrome.');
  }

  const tokens = {
    at: atMatch[1],
    fdr: fdrMatch ? fdrMatch[1] : '',
    bl: blMatch ? blMatch[1] : 'boq_gemini-web-uiserver_20261006.13_p0',
    timestamp: Date.now()
  };

  await setCachedSessionTokens(tokens);
  return tokens;
}

async function clearCachedSessionTokens() {
  cachedTokens = { at: null, fdr: null, bl: null, timestamp: 0 };
  try {
    if (chrome.storage?.session) {
      await chrome.storage.session.remove('headlessTokens');
    }
  } catch (e) {
    console.warn('[Background] chrome.storage.session clear error:', e);
  }
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

  let response;
  try {
    response = await fetch(reqUrl, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
      },
      body: bodyParams.toString(),
      signal: AbortSignal.timeout(30000)
    });
  } catch (netErr) {
    if (netErr.name === 'TimeoutError') {
      throw new Error('Headless Gemini request timed out after 30 seconds.');
    }
    throw netErr;
  }

  if (!response.ok) {
    if (response.status === 400 || response.status === 401 || response.status === 403) {
      await clearCachedSessionTokens();
    }
    throw new Error(`Headless Gemini request returned HTTP ${response.status}`);
  }

  // Stream the response body as chunks arrive instead of buffering the whole payload
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let rawText = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    rawText += decoder.decode(value, { stream: true });
  }
  rawText += decoder.decode(); // flush any remaining bytes

  const candidate = extractHeadlessReplyText(rawText, promptText);

  if (!candidate) {
    await clearCachedSessionTokens();
    throw new Error('Could not parse text reply from headless stream.');
  }

  return candidate;
}


// Robust Batchexecute response extractor for Headless Gemini
function extractHeadlessReplyText(rawText, promptText = '') {
  if (!rawText) return '';

  // 1. Direct JSON extraction from Google batchexecute stream
  const lines = rawText.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('[') && !trimmed.startsWith('"[') ) continue;

    try {
      const parsedEnvelope = JSON.parse(trimmed);
      if (Array.isArray(parsedEnvelope)) {
        for (const item of parsedEnvelope) {
          if (Array.isArray(item) && item[2] && typeof item[2] === 'string') {
            try {
              const innerData = JSON.parse(item[2]);
              // Strategy A: Standard Gemini path: innerData[4][0][1][0]
              if (innerData?.[4]?.[0]?.[1]?.[0] && typeof innerData[4][0][1][0] === 'string') {
                return innerData[4][0][1][0].trim();
              }
              // Strategy B: Search for candidate block starting with rc_
              const rcCandidates = findCandidateByRc(innerData);
              if (rcCandidates) return rcCandidates.trim();
            } catch (innerErr) {}
          }
        }
      }
    } catch (e) {}
  }

  // Strategy C: Regex search for rc_ pattern in rawText (e.g. [\"rc_...\",[\"The answer text...\"])
  const rcMatch = rawText.match(/\[\\?"rc_[^"]+\\?",\s*\[\\?"([^"\\]*(?:\\.[^"\\]*)*)\\?"\]/);
  if (rcMatch && rcMatch[1]) {
    try {
      return JSON.parse(`"${rcMatch[1]}"`).trim();
    } catch (e) {
      return rcMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\').trim();
    }
  }

  // Strategy D: Deep string harvesting (fallback, strictly filtering out JSON containers)
  const stringRegex = /"([^"\\]*(?:\\.[^"\\]*)*)"/g;
  let m;
  let maxLen = 0;
  let candidate = '';
  const promptSig = promptText.length > 30 ? promptText.substring(0, 30) : promptText;

  while ((m = stringRegex.exec(rawText)) !== null) {
    let unescaped = '';
    try {
      unescaped = JSON.parse(`"${m[1]}"`);
    } catch (e) {
      unescaped = m[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
    }

    if (
      unescaped.length > maxLen &&
      unescaped.length < 3000 &&
      !unescaped.startsWith('[') &&
      !unescaped.startsWith('{') &&
      !unescaped.startsWith('http') &&
      !unescaped.startsWith('boq_') &&
      !unescaped.startsWith('rc_') &&
      !unescaped.startsWith('c_') &&
      !unescaped.startsWith('r_') &&
      !unescaped.includes('BardFrontendService') &&
      !unescaped.includes('SNlM0e') &&
      !unescaped.includes('FdrFJe') &&
      !unescaped.includes('cfb2h') &&
      !unescaped.includes('assistant.lamda') &&
      !unescaped.includes('generic') &&
      !unescaped.includes('You are an authentic user') &&
      !unescaped.includes('You are crafting an authentic Twitter') &&
      (!promptSig || !unescaped.includes(promptSig))
    ) {
      maxLen = unescaped.length;
      candidate = unescaped;
    }
  }

  return candidate.trim();
}

function findCandidateByRc(node) {
  if (!node) return null;
  if (Array.isArray(node)) {
    if (typeof node[0] === 'string' && node[0].startsWith('rc_') && Array.isArray(node[1]) && typeof node[1][0] === 'string') {
      return node[1][0];
    }
    for (const child of node) {
      const res = findCandidateByRc(child);
      if (res) return res;
    }
  }
  return null;
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
    await new Promise(r => setTimeout(r, 100));
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
async function executeWithFallback(engine, promptText, customInstructions = '', mode = 'reply') {
  // 1. Try selected engine
  try {
    if (engine === 'nano') {
      const reply = await generateViaNano(promptText, customInstructions, mode);
      return { reply, engine: 'Gemini Nano' };
    }
    if (engine === 'cloud_api') {
      const { cloudModel = 'gemini-3.1-flash-lite' } = await chrome.storage.local.get(['cloudModel']);
      const reply = await generateViaCloudAPI(promptText, customInstructions, mode);
      return { reply, engine: `Cloud API (${cloudModel})` };
    }
    if (engine === 'headless') {
      const reply = await generateViaHeadless(promptText);
      return { reply, engine: 'Headless Web' };
    }
    const reply = await generateViaWebTab(promptText);
    return { reply, engine: 'Gemini Web Tab' };
  } catch (primaryErr) {
    console.warn(`[Background] Primary engine '${engine}' failed:`, primaryErr);

    // If cloud_api failed, try nano next if available, then headless, then web_tab
    if (engine === 'cloud_api') {
      try {
        const nanoStatus = await checkNanoStatus();
        if (nanoStatus.available && nanoStatus.isReady !== false) {
          console.log('[Background] Cloud API failed, falling back to Gemini Nano.');
          const reply = await generateViaNano(promptText, customInstructions, mode);
          return { reply, engine: 'Gemini Nano (fallback)' };
        }
      } catch (nanoErr) {
        console.warn('[Background] Fallback to Gemini Nano failed:', nanoErr);
      }

      try {
        console.log('[Background] Cloud API failed, attempting silent Headless fallback.');
        const reply = await generateViaHeadless(promptText);
        return { reply, engine: 'Headless Web (fallback)' };
      } catch (headlessErr) {
        console.warn('[Background] Silent Headless fallback failed:', headlessErr);
      }
      // Note: Falls through to Web Tab fallback below!
    }

    // 2. If headless failed, try Nano next if available, or Cloud API if configured
    if (engine === 'headless') {
      try {
        const nanoStatus = await checkNanoStatus();
        if (nanoStatus.available && nanoStatus.isReady !== false) {
          console.log('[Background] Headless failed, falling back to Gemini Nano.');
          const reply = await generateViaNano(promptText, customInstructions, mode);
          return { reply, engine: 'Gemini Nano (fallback)' };
        }
      } catch (nanoErr) {
        console.warn('[Background] Fallback to Gemini Nano failed:', nanoErr);
      }

      try {
        const { apiKey = '', cloudModel = 'gemini-3.1-flash-lite' } = await chrome.storage.local.get(['apiKey', 'cloudModel']);
        if (apiKey.trim().length > 10) {
          console.log('[Background] Headless failed, falling back to Cloud API.');
          const reply = await generateViaCloudAPI(promptText, customInstructions, mode);
          return { reply, engine: `Cloud API (${cloudModel}) (fallback)` };
        }
      } catch (cloudErr) {
        console.warn('[Background] Fallback to Cloud API failed:', cloudErr);
      }
    }

    // 3. If nano failed, try Cloud API if configured, then silent Headless
    if (engine === 'nano') {
      try {
        const { apiKey = '', cloudModel = 'gemini-3.1-flash-lite' } = await chrome.storage.local.get(['apiKey', 'cloudModel']);
        if (apiKey.trim().length > 10) {
          console.log('[Background] Gemini Nano failed, falling back to Cloud API.');
          const reply = await generateViaCloudAPI(promptText, customInstructions, mode);
          return { reply, engine: `Cloud API (${cloudModel}) (fallback)` };
        }
      } catch (cloudErr) {
        console.warn('[Background] Fallback to Cloud API failed:', cloudErr);
      }

      try {
        console.log('[Background] Gemini Nano failed, attempting silent Headless fallback.');
        const reply = await generateViaHeadless(promptText);
        return { reply, engine: 'Headless Web (fallback)' };
      } catch (headlessErr) {
        console.warn('[Background] Silent Headless fallback failed:', headlessErr);
      }
    }

    // 4. Fallback to Web Tab for all non-web_tab engines
    if (engine === 'nano' || engine === 'headless' || engine === 'cloud_api') {
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
        let { engine = 'cloud_api', apiKey = '', cloudModel = 'gemini-3.1-flash-lite' } = await chrome.storage.local.get(['engine', 'apiKey', 'cloudModel']);

        if (!cloudModel || /gemma/i.test(cloudModel)) {
          cloudModel = 'gemini-3.1-flash-lite';
          await chrome.storage.local.set({ cloudModel });
        }

        if (engine === 'cloud_api') {
          const hasKey = apiKey.trim().length > 10;
          return sendResponse({
            engine: 'cloud_api',
            connected: hasKey,
            statusText: hasKey ? `Ready (${cloudModel})` : 'Key Missing',
            message: hasKey
              ? `Connected to Google Gemini Cloud API (${cloudModel}). 0 tabs needed!`
              : 'Gemini API Key required. Open Settings to enter your key.',
            model: cloudModel
          });
        }

        if (engine === 'nano') {
          const nanoStatus = await checkNanoStatus();
          const isConnected = !!(nanoStatus.available && nanoStatus.isReady !== false);
          let statusText = 'Nano Unavailable';
          let msg = 'Gemini Nano not enabled. Check chrome://flags or switch engine.';

          if (nanoStatus.available) {
            if (nanoStatus.needsDownload || nanoStatus.status === 'after-download' || nanoStatus.status === 'downloadable') {
              statusText = 'Download Needed';
              msg = 'Model supported but needs downloading via chrome://components.';
            } else if (nanoStatus.isReady) {
              statusText = 'Ready (Local AI)';
              msg = 'Chrome Built-in Gemini Nano is ready. 0 tabs needed!';
            } else {
              statusText = 'Ready (Local AI)';
              msg = 'Gemini Nano detected. 0 tabs needed!';
            }
          }

          return sendResponse({
            engine: 'nano',
            connected: isConnected,
            statusText: statusText,
            message: msg,
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

      // Validate Cloud API Key from settings popup
      if (message.type === 'VALIDATE_CLOUD_API_KEY') {
        const { apiKey = '', model = 'gemini-3.1-flash-lite' } = message.payload || {};
        const validation = await validateCloudAPIKey(apiKey, model);
        return sendResponse(validation);
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

      // 3. Generate Reply (Supports All 4 Engines with Smooth Auto-Fallback)
      if (message.type === 'GENERATE_REPLY') {
        const settings = await chrome.storage.local.get(['engine', 'customInstructions']);
        const engine = settings.engine || 'cloud_api';
        const customInstructions = settings.customInstructions || message.payload?.customInstructions || '';
        const promptText = buildGeminiPrompt({
          ...message.payload,
          customInstructions
        });

        const result = await executeWithFallback(engine, promptText, customInstructions, 'reply');

        return sendResponse({
          success: true,
          reply: cleanGeneratedReply(result.reply, customInstructions),
          engine: result.engine
        });
      }

      // 4. Generate New Post (Supports All 4 Engines with Smooth Auto-Fallback)
      if (message.type === 'GENERATE_POST') {
        const settings = await chrome.storage.local.get(['engine', 'customInstructions']);
        const engine = settings.engine || 'cloud_api';
        const customInstructions = settings.customInstructions || message.payload?.customInstructions || '';
        const promptText = buildGeminiPostPrompt({
          ...message.payload,
          customInstructions
        });

        const result = await executeWithFallback(engine, promptText, customInstructions, 'post');

        return sendResponse({
          success: true,
          post: cleanGeneratedPost(result.reply, customInstructions),
          engine: result.engine
        });
      }

      sendResponse({ success: false, error: 'UNKNOWN_TYPE' });
    } catch (globalError) {
      console.error('[Background] Error:', globalError);
      const errMsg = globalError.message || '';
      let errCode = 'INTERNAL_ERROR';
      if (/not logged in|session token|log in|ServiceLogin/i.test(errMsg)) {
        errCode = 'NOT_LOGGED_IN';
      } else if (/no tab|tab is not open|not responding/i.test(errMsg)) {
        errCode = 'NO_TAB';
      } else if (/api key/i.test(errMsg)) {
        errCode = 'API_KEY_ERROR';
      }

      sendResponse({
        success: false,
        error: errCode,
        message: errMsg
      });
    }
  })();

  return true;
});

// Helper: check if custom instructions request no emojis
function hasNoEmojiInstruction(instructions) {
  if (!instructions) return false;
  return /(?:no|zero|without|avoid|don'?t\s+use|do\s+not\s+use|never\s+use|free\s+of|stop\s+using|disallow)\s+emojis?/i.test(instructions);
}

// Helper: check if custom instructions request no hashtags
function hasNoHashtagInstruction(instructions) {
  if (!instructions) return false;
  return /(?:no|zero|without|avoid|don'?t\s+use|do\s+not\s+use|never\s+use|free\s+of|stop\s+using|disallow)\s+hashtags?/i.test(instructions);
}

// Prompt Builder for Replies
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
  const noEmoji = hasNoEmojiInstruction(customInstructions);
  const noHashtags = hasNoHashtagInstruction(customInstructions);

  const customBlock = customInstructions
    ? `Custom Rules: ${customInstructions}\n`
    : '';

  return `${customBlock}You are an authentic user on Twitter (X). Write a ${selectedTone} reply to this tweet${authorMention}:
"""
${tweetText}
"""

Requirements:
- Single direct reply only, under 260 characters.
- Conversational and human.
- No quotation marks.
- No conversational preamble.
${noEmoji ? '- No emojis.\n' : ''}${noHashtags ? '- No hashtags.\n' : ''}
Reply:`;
}

// Cleaner for Replies (Robust extraction for Gemma, Gemini, and thinking models)
function cleanGeneratedReply(rawText, customInstructions = '') {
  if (!rawText) return '';
  let text = rawText.trim();

  // 1. Detect if model generated a scratchpad, option list, or chain-of-thought analysis
  const hasScratchpad = /(?:\*+\s*(?:User wants|Original [Tt]weet|Target|Constraints|Tone|Topic|Goal|Category|Platform|Persona|Witty angles|Analyzing|Evaluating|Draft|Thinking|Thought)|Option\s*\d|\*+Option\s*\d)/i.test(text)
    || (text.split('\n').filter(l => /^\s*[*•-]/.test(l)).length >= 2);

  if (hasScratchpad) {
    // Strategy A: Check for numbered options (e.g. Option 1:, *Option 1:*, **Option 1:**, *Option 4* is quite "Twitter-esque")
    const optionMatches = [...text.matchAll(/(?:^|[\n*•-])\s*\*?\*?Option\s*(\d)\*?:\*?\s*([^\n*]+)/gi)];
    if (optionMatches.length > 0) {
      // Check if the model praised a specific option at the end
      const praisedMatch = text.match(/Option\s*(\d)[^.\n]*(?:Twitter|best|clever|witty|classic|favorite)/i);
      let chosen = optionMatches[0];
      if (praisedMatch) {
        const found = optionMatches.find(m => m[1] === praisedMatch[1]);
        if (found) chosen = found;
      }
      let candidate = chosen[2].trim().replace(/^["'“]|["'”]$/g, '').trim();
      if (candidate.length >= 10) {
        return sanitizeTweetOutput(candidate, customInstructions);
      }
    }

    // Strategy B: Check for bulleted quotes (e.g., * "My portfolio is already at its highest level...")
    const bulletQuotes = [...text.matchAll(/(?:^|[\n*•-])\s*["“]([^"”\n]{15,260})["”]/g)];
    if (bulletQuotes.length > 0) {
      const validQuotes = bulletQuotes.filter(q => {
        const t = q[1].trim();
        return !t.toLowerCase().includes('30-year bond') && !t.toLowerCase().includes('original tweet') && t.length >= 15;
      });
      if (validQuotes.length > 0) {
        return sanitizeTweetOutput(validQuotes[validQuotes.length - 1][1].trim(), customInstructions);
      }
    }

    // Strategy C: Strip all bullet metadata and take clean text
    text = text.replace(/(?:^|\n)\s*[*•-]\s*(?:User wants|Original [Tt]weet|Target|Constraints|Tone|Topic|Goal|Category|Platform|Persona|Subject|Sentiment|High bond yields|Witty angles|Analyzing|Evaluating|Draft|Thinking)[^:\n]*:[^\n]*/gi, '');
    text = text.replace(/[*•-]\s*\*?Option\s*\d\*?:?/gi, '');
    text = text.replace(/Wait,\s*let'?ss*makes*its*evens*more[^".\n]*[.:]?/gi, '');
    text = text.replace(/Under\s*\d+\s*chars\?\s*Yes\./gi, '');
    text = text.replace(/No\s*(?:hashtags|quotation)[^?]*\?\s*Yes\./gi, '');
    text = text.replace(/Natural\/Human\?\s*Yes\./gi, '');
  }

  return sanitizeTweetOutput(text, customInstructions);
}

// Universal Tweet Output Sanitizer
function sanitizeTweetOutput(text, customInstructions = '') {
  let cleaned = text.trim();

  // Strip conversational AI prefixes
  cleaned = cleaned.replace(/^(?:sure(?: thing)?[!,.]?\s*)?(?:here(?:'s| is) (?:a |the )?(?:suggested |quick |twitter |witty )?reply:?\s*|twitter reply:?\s*|suggested reply:?\s*|reply:?\s*)/i, '').trim();

  // Strip outer quotes
  if ((cleaned.startsWith('"') && cleaned.endsWith('"')) || (cleaned.startsWith('“') && cleaned.endsWith('”')) || (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
    cleaned = cleaned.slice(1, -1).trim();
  }

  // Strip stray markdown asterisks
  cleaned = cleaned.replace(/^\*+\s*/, '').replace(/\s*\*+$/, '').trim();

  // Strip extra internal double-spacing
  cleaned = cleaned.replace(/\s{2,}/g, ' ');

  // Programmatic enforcement if user requested no emoji
  if (hasNoEmojiInstruction(customInstructions)) {
    cleaned = cleaned.replace(/[\p{Extended_Pictographic}\uFE00-\uFE0F]/ug, '').replace(/\s+([,.!?])/g, '$1').replace(/\s{2,}/g, ' ').trim();
  }

  // Programmatic enforcement if user requested no hashtags
  if (hasNoHashtagInstruction(customInstructions)) {
    cleaned = cleaned.replace(/#[A-Za-z0-9_]+/g, '').replace(/\s{2,}/g, ' ').trim();
  }

  // Limit length to 280 characters cleanly at sentence or word boundary
  if (cleaned.length > 280) {
    const cut = cleaned.substring(0, 275);
    const lastPunct = Math.max(cut.lastIndexOf('.'), cut.lastIndexOf('!'), cut.lastIndexOf('?'));
    if (lastPunct > 60) {
      cleaned = cut.substring(0, lastPunct + 1).trim();
    } else {
      const lastSpace = cut.lastIndexOf(' ');
      cleaned = (lastSpace > 60 ? cut.substring(0, lastSpace) : cut) + '...';
    }
  }

  return cleaned;
}

// Prompt Builder for New Posts
function buildGeminiPostPrompt({ topicOrDraft, isDraft, style, customInstructions }) {
  const styleDescriptions = {
    engaging: 'highly engaging, punchy, with a strong curiosity hook in the first line that grabs immediate attention',
    insight: 'informative, valuable, and actionable thought leadership or life/tech lessons',
    announcement: 'celebratory, exciting, and clear for a product launch, milestone, or major update',
    hottake: 'bold, thought-provoking, and persuasive with a contrarian or fresh angle',
    witty: 'clever, humorous, relatable, and casual with modern internet wit',
    question: 'an intriguing open-ended question designed to spark high-volume replies and discussions',
    thread: 'a compelling hook opening tweet designed to introduce a multi-part thread'
  };

  const selectedStyle = styleDescriptions[style] || styleDescriptions.engaging;
  const noEmoji = hasNoEmojiInstruction(customInstructions);
  const noHashtags = hasNoHashtagInstruction(customInstructions);

  const customBlock = customInstructions
    ? `MANDATORY USER RULES — HIGHEST PRIORITY — OVERRIDE EVERYTHING ELSE:\n${customInstructions}\n\n`
    : '';

  if (isDraft) {
    return `${customBlock}You are an elite Twitter (X) creator. Rewrite, polish, and optimize the following rough draft into a high-performing standalone tweet.

Draft tweet:
"""
${topicOrDraft}
"""

Target Style: ${selectedStyle}.
Strict Instructions:
- Output ONLY the final polished tweet text.
- Under 260 characters total.
- Maintain the original core message and intent.
- Ensure natural conversational cadence, strong opening, and clean line breaks if needed.
- Do NOT wrap in quotes.
- Do NOT include preambles like "Here is a tweet:" or "Revised:".
${noEmoji ? '- MANDATORY: Absolutely NO emojis, symbols, or emoticons under any circumstances. Text ONLY.' : ''}
${noHashtags ? '- MANDATORY: Absolutely NO hashtags (#).' : '- Do NOT include hashtags unless explicitly asked.'}
${customInstructions ? `\nREMINDER — USER RULES STILL APPLY AND CANNOT BE IGNORED:\n${customInstructions}` : ''}`;
  }

  return `${customBlock}You are an elite Twitter (X) creator. Write an authentic, high-performing standalone tweet on the given topic or idea.

Topic / Idea:
"""
${topicOrDraft}
"""

Target Style: ${selectedStyle}.
Strict Instructions:
- Output ONLY the final tweet text.
- Under 260 characters total.
- Punchy first line (strong hook).
- Natural, conversational human tone (avoid corporate jargon or generic influencer clichés).
- Do NOT wrap in quotes.
- Do NOT include preambles like "Here is a tweet:" or "Tweet:".
${noEmoji ? '- MANDATORY: Absolutely NO emojis, symbols, or emoticons under any circumstances. Text ONLY.' : ''}
${noHashtags ? '- MANDATORY: Absolutely NO hashtags (#).' : '- Do NOT include hashtags unless explicitly asked.'}
${customInstructions ? `\nREMINDER — USER RULES STILL APPLY AND CANNOT BE IGNORED:\n${customInstructions}` : ''}`;
}

// Cleaner for New Posts
function cleanGeneratedPost(rawText, customInstructions = '') {
  if (!rawText) return '';
  return cleanGeneratedReply(rawText, customInstructions);
}
