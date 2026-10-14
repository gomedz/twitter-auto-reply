// background.js - Multi-Engine Service Worker for Twitter AI Auto Reply
// Supports:
// 1. 'nano': Chrome Built-in Gemini Nano (0 tabs, local GPU, Prompt API)
// 2. 'cloud_api': Google Gemini Cloud REST API (0 tabs, free API key, 3.5-flash-lite / 3.6-flash / 3.8-flash / 2.5-flash)
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
  cloudModel: 'gemini-3.5-flash-lite',
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
  // Auto-migrate retired models (1.5, 2.0, 2.5-flash-lite) to gemini-3.5-flash-lite
  if (existing.cloudModel && /gemma|1\.5|2\.0|2\.5-flash-lite/i.test(existing.cloudModel)) {
    toSet.cloudModel = 'gemini-3.5-flash-lite';
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
// ==========================================
function buildThinkingConfigForModel(modelName) {
  // Gemini 2.5 Flash supports thinkingBudget: 0
  if (/gemini-2\.5-flash/i.test(modelName)) {
    return { thinkingBudget: 0 };
  }
  // Gemini 3.x Flash models use thinkingLevel instead of thinkingBudget
  return null;
}

async function generateViaCloudAPI(promptText, customInstructions = '', mode = 'reply') {
  const {
    apiKey = '',
    cloudModel = 'gemini-3.5-flash-lite'
  } = await chrome.storage.local.get(['apiKey', 'cloudModel']);
  const cleanKey = apiKey.trim();

  if (!cleanKey) {
    throw new Error('Gemini API key is missing. Please open extension settings and configure your Google Gemini API key.');
  }

  let targetModel = cloudModel || 'gemini-3.5-flash-lite';
  if (/gemma|1\.5|2\.0|2\.5-flash-lite/i.test(targetModel)) {
    targetModel = 'gemini-3.5-flash-lite';
    await chrome.storage.local.set({ cloudModel: 'gemini-3.5-flash-lite' });
  }

  let systemInstructionText = mode === 'post'
    ? 'You are an elite Twitter (X) post creator. Output ONLY the single final tweet text to post. NEVER output brainstorming, reasoning, options (Option 1/2), notes, or quotes. Output plain text under 260 characters.'
    : 'You are an authentic Twitter (X) reply generator. Output ONLY the single final tweet text to post. NEVER output brainstorming, reasoning, options (Option 1/2), notes, or quotes. Output plain text under 260 characters.';

  if (customInstructions) {
    systemInstructionText += ' STRICT USER RULES: ' + customInstructions;
  }
  if (hasNoEmojiInstruction(customInstructions)) {
    systemInstructionText += ' Absolutely NO emojis. Plain text only.';
  }

  // Primary candidate models ordered by low latency & high availability in 2026
  const uniqueCandidateModels = Array.from(new Set([
    targetModel,
    'gemini-3.5-flash-lite',
    'gemini-3.6-flash',
    'gemini-3.8-flash',
    'gemini-2.5-flash'
  ])).filter(Boolean);

  let lastErrorDetail = '';
  for (const model of uniqueCandidateModels) {
    const generationConfig = {
      temperature: 0.85,
      maxOutputTokens: 260
    };

    const thinkingCfg = buildThinkingConfigForModel(model);
    if (thinkingCfg) {
      generationConfig.thinkingConfig = thinkingCfg;
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
    const reqStart = Date.now();
    const timeoutMs = /pro/i.test(model) ? 12000 : 8000;

    try {
      console.log(`[Background] Cloud API: Requesting '${model}'...`);
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': cleanKey
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(timeoutMs)
      });

      if (response.ok) {
        const data = await response.json();
        const parts = data?.candidates?.[0]?.content?.parts || [];
        const validTextParts = parts.filter(p => !p.thought && typeof p.text === 'string');
        const text = validTextParts.length > 0
          ? validTextParts.map(p => p.text).join('').trim()
          : (parts[0]?.text || '').trim();
        if (!text) {
          throw new Error('Received empty response from Gemini Cloud API.');
        }
        console.log(`[Background] Cloud API: Model '${model}' succeeded in ${Date.now() - reqStart}ms!`);
        return { text, usedModel: model };
      }

      const errJson = await response.json().catch(() => ({}));
      lastErrorDetail = errJson.error?.message || `HTTP ${response.status} ${response.statusText}`;

      if (response.status === 400 && (lastErrorDetail.includes('API_KEY_INVALID') || lastErrorDetail.includes('not valid') || lastErrorDetail.includes('API key not valid'))) {
        throw new Error(`Google API Key is invalid: ${lastErrorDetail}`);
      }

      console.warn(`[Background] Model '${model}' failed after ${Date.now() - reqStart}ms (${response.status}: ${lastErrorDetail}). Trying next candidate...`);
    } catch (fetchErr) {
      if (fetchErr.message && (fetchErr.message.includes('API Key is invalid') || fetchErr.message.includes('API key is missing'))) {
        throw fetchErr;
      }
      lastErrorDetail = fetchErr.message;
      console.warn(`[Background] Model '${model}' encountered error after ${Date.now() - reqStart}ms: ${fetchErr.message}. Trying next candidate...`);
    }
  }

  throw new Error(`Gemini Cloud API Error: ${lastErrorDetail}`);
}

// Validate Google Gemini API Key
async function validateCloudAPIKey(apiKey, requestedModel = 'gemini-3.5-flash-lite') {
  const cleanKey = (apiKey || '').trim();
  if (!cleanKey) {
    return { valid: false, message: 'API key is empty.' };
  }

  if (requestedModel && /gemma/i.test(requestedModel)) {
    return {
      valid: false,
      message: 'Gemma models are disabled. Please choose a Gemini model (e.g. Gemini 3.5 Flash-Lite).'
    };
  }

  let availableModels = [];
  try {
    const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(cleanKey)}`, {
      headers: { 'x-goog-api-key': cleanKey },
      signal: AbortSignal.timeout(6000)
    });
    if (!listRes.ok) {
      const errData = await listRes.json().catch(() => ({}));
      const errMsg = errData.error?.message || `HTTP ${listRes.status}: ${listRes.statusText}`;
      if (listRes.status === 400 && (errMsg.includes('API_KEY_INVALID') || errMsg.includes('not valid') || errMsg.includes('API key not valid'))) {
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

  const modelToTest = (!requestedModel || /1\.5|2\.0|2\.5-flash-lite/i.test(requestedModel))
    ? 'gemini-3.5-flash-lite'
    : requestedModel;

  const generationConfig = { temperature: 0.7, maxOutputTokens: 20 };
  const thinkingCfg = buildThinkingConfigForModel(modelToTest);
  if (thinkingCfg) {
    generationConfig.thinkingConfig = thinkingCfg;
  }

  try {
    const testRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelToTest)}:generateContent?key=${encodeURIComponent(cleanKey)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': cleanKey
        },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'Hi' }] }],
          generationConfig
        }),
        signal: AbortSignal.timeout(8000)
      }
    );

    if (testRes.ok) {
      return {
        valid: true,
        model: modelToTest,
        apiVersion: 'v1beta',
        message: `✓ Valid & Ready! Connected to ${modelToTest}`
      };
    }

    const errData = await testRes.json().catch(() => ({}));
    const errDetail = errData.error?.message || `HTTP ${testRes.status}`;

    if (testRes.status === 429 || errDetail.includes('quota metric') || errDetail.includes('requests per minute')) {
      return {
        valid: true,
        model: modelToTest,
        apiVersion: 'v1beta',
        message: `✓ Key is Valid! Note: ${modelToTest} hit 1-min RPM limit. Try Gemini 3.5 Flash-Lite.`
      };
    }

    if (testRes.status === 404 || errDetail.includes('no longer available')) {
      const fallback = availableModels.find(m => m.includes('3.5-flash-lite') || (m.includes('flash') && !m.includes('2.5-flash-lite') && !m.includes('image') && !m.includes('tts') && !m.includes('audio'))) || 'gemini-3.5-flash-lite';
      return {
        valid: true,
        model: fallback,
        apiVersion: 'v1beta',
        message: `✓ Valid Key! Switched to active model ${fallback}`
      };
    }

    return {
      valid: true,
      model: modelToTest,
      apiVersion: 'v1beta',
      message: `✓ Valid API Key! (Status: ${errDetail.substring(0, 80)})`
    };
  } catch (genErr) {
    return {
      valid: true,
      model: modelToTest,
      apiVersion: 'v1beta',
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
    return { ...cached, fromCache: true };
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
    bl: blMatch ? blMatch[1] : 'boq_assistant-bard-web-server_20261006.13_p0',
    timestamp: Date.now()
  };

  await setCachedSessionTokens(tokens);
  return { ...tokens, fromCache: false };
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

async function generateViaHeadless(promptText, retryCount = 0) {
  const tokens = await getHeadlessSessionTokens();

  // StreamGenerate expects an 80-slot inner array wrapped in [null, JSON.stringify(inner)]
  const inner = new Array(80).fill(null);
  inner[0] = [promptText, 0, null, null, null, null, 0];
  inner[1] = ["en"];
  inner[2] = ["", "", "", null, null, null, null, null, null, ""];

  const outer = [null, JSON.stringify(inner)];

  const bodyParams = new URLSearchParams();
  bodyParams.append('f.req', JSON.stringify(outer));
  if (tokens.at) {
    bodyParams.append('at', tokens.at);
  }

  const reqId = Math.floor(Math.random() * 900000) + 100000;
  const fSidParam = tokens.fdr ? `&f.sid=${encodeURIComponent(tokens.fdr)}` : '';
  const reqUrl = `https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate?bl=${encodeURIComponent(tokens.bl)}${fSidParam}&hl=en&_reqid=${reqId}&rt=c`;

  let response;
  try {
    response = await fetch(reqUrl, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'X-Same-Domain': '1',
        'x-goog-ext-73010989-jspb': '[0]'
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
      if (tokens.fromCache && retryCount < 1) {
        return await generateViaHeadless(promptText, retryCount + 1);
      }
    }
    throw new Error(`Headless Gemini request returned HTTP ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let rawText = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    rawText += decoder.decode(value, { stream: true });
  }
  rawText += decoder.decode();

  const candidate = extractHeadlessReplyText(rawText, promptText);

  if (!candidate) {
    await clearCachedSessionTokens();
    if (tokens.fromCache && retryCount < 1) {
      return await generateViaHeadless(promptText, retryCount + 1);
    }
    throw new Error('Could not parse text reply from headless stream. Ensure you are signed into gemini.google.com.');
  }

  return candidate;
}

// Recursively find "wrb.fr" frames at any array depth
function collectWrbPayloads(node, out = []) {
  if (!Array.isArray(node)) return out;
  if (node[0] === 'wrb.fr' && typeof node[2] === 'string') {
    out.push(node[2]);
    return out;
  }
  for (const child of node) {
    if (Array.isArray(child)) {
      collectWrbPayloads(child, out);
    }
  }
  return out;
}

// Robust Batchexecute / StreamGenerate response extractor for Headless Gemini
function extractHeadlessReplyText(rawText, promptText = '') {
  if (!rawText) return '';

  let latestStreamedReply = '';

  const lines = rawText.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('[') && !trimmed.startsWith('"[')) continue;

    try {
      const parsedEnvelope = JSON.parse(trimmed);
      const wrbPayloads = collectWrbPayloads(parsedEnvelope);
      for (const payloadStr of wrbPayloads) {
        try {
          const innerData = JSON.parse(payloadStr);
          if (innerData?.[4]?.[0]?.[1]?.[0] && typeof innerData[4][0][1][0] === 'string') {
            latestStreamedReply = innerData[4][0][1][0].trim();
          } else {
            const rcCandidate = findCandidateByRc(innerData);
            if (rcCandidate) {
              latestStreamedReply = rcCandidate.trim();
            }
          }
        } catch (innerErr) {}
      }
    } catch (e) {}
  }

  if (latestStreamedReply) return latestStreamedReply;

  // Strategy C: Regex search for rc_ pattern in rawText
  const rcMatches = [...rawText.matchAll(/\[\\?"rc_[^"]+\\?",\s*\[\\?"([^"\\]*(?:\\.[^"\\]*)*)\\?"/g)];
  if (rcMatches.length > 0) {
    const lastMatch = rcMatches[rcMatches.length - 1][1];
    try {
      return JSON.parse(`"${lastMatch}"`).trim();
    } catch (e) {
      return lastMatch.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\').trim();
    }
  }

  // Strategy D: Deep string harvesting (preferring valid tweet-length strings)
  const stringRegex = /"([^"\\]*(?:\\.[^"\\]*)*)"/g;
  let m;
  let bestTweetCandidate = '';
  let bestFallbackCandidate = '';
  let maxFallbackLen = 0;
  const promptSig = promptText.length > 30 ? promptText.substring(0, 30) : promptText;

  while ((m = stringRegex.exec(rawText)) !== null) {
    let unescaped = '';
    try {
      unescaped = JSON.parse(`"${m[1]}"`);
    } catch (e) {
      unescaped = m[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
    }

    const trimmedCandidate = unescaped.trim();
    if (
      trimmedCandidate.length >= 15 &&
      trimmedCandidate.length < 3000 &&
      !trimmedCandidate.startsWith('[') &&
      !trimmedCandidate.startsWith('{') &&
      !trimmedCandidate.startsWith('http') &&
      !trimmedCandidate.startsWith('boq_') &&
      !trimmedCandidate.startsWith('rc_') &&
      !trimmedCandidate.startsWith('c_') &&
      !trimmedCandidate.startsWith('r_') &&
      !trimmedCandidate.includes('BardFrontendService') &&
      !trimmedCandidate.includes('SNlM0e') &&
      !trimmedCandidate.includes('FdrFJe') &&
      !trimmedCandidate.includes('cfb2h') &&
      !trimmedCandidate.includes('assistant.lamda') &&
      !trimmedCandidate.includes('generic') &&
      !trimmedCandidate.includes('You are an authentic user') &&
      !trimmedCandidate.includes('You are crafting an authentic Twitter') &&
      (!promptSig || !trimmedCandidate.includes(promptSig)) &&
      /\s/.test(trimmedCandidate)
    ) {
      if (trimmedCandidate.length <= 280) {
        bestTweetCandidate = trimmedCandidate;
      } else if (trimmedCandidate.length > maxFallbackLen) {
        maxFallbackLen = trimmedCandidate.length;
        bestFallbackCandidate = trimmedCandidate;
      }
    }
  }

  return (bestTweetCandidate || bestFallbackCandidate).trim();
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
    } catch (e) {}
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

    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      callerTab = activeTab;
    } catch (e) {}

    geminiTab = await chrome.tabs.create({
      url: GEMINI_URL,
      active: true
    });
    createdNewTab = true;
  }

  try {
    if (createdNewTab) {
      const isReady = await waitForGeminiTabReady(geminiTab.id, 25000);
      if (callerTab) {
        try {
          await chrome.tabs.update(callerTab.id, { active: true });
        } catch (e) {}
      }
      if (!isReady) {
        throw new Error('Gemini tab took too long to load. Please ensure you are logged into gemini.google.com/app.');
      }
    }

    const geminiResult = await sendToGeminiTab(geminiTab.id, {
      type: 'EXECUTE_PROMPT',
      prompt: promptText
    }, 45000);

    if (!geminiResult || geminiResult.error) {
      throw new Error(geminiResult?.message || 'Gemini encountered an error.');
    }

    if (createdNewTab && settings.autoCloseTab !== false) {
      try {
        await chrome.tabs.remove(geminiTab.id);
      } catch (e) {}
    }

    return geminiResult.reply;
  } catch (err) {
    if (createdNewTab && callerTab) {
      try {
        await chrome.tabs.update(callerTab.id, { active: true });
      } catch (e) {}
    }
    if (createdNewTab && settings.autoCloseTab !== false && geminiTab?.id) {
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
async function executeWithFallback(engine, promptText, customInstructions = '', mode = 'reply', disableFallback = false) {
  try {
    if (engine === 'nano') {
      const reply = await generateViaNano(promptText, customInstructions, mode);
      return { reply, engine: 'Gemini Nano' };
    }
    if (engine === 'cloud_api') {
      const { text, usedModel } = await generateViaCloudAPI(promptText, customInstructions, mode);
      return { reply: text, engine: `Cloud API (${usedModel})` };
    }
    if (engine === 'headless') {
      const reply = await generateViaHeadless(promptText);
      return { reply, engine: 'Headless Web' };
    }
    const reply = await generateViaWebTab(promptText);
    return { reply, engine: 'Gemini Web Tab' };
  } catch (primaryErr) {
    console.warn(`[Background] Primary engine '${engine}' failed:`, primaryErr);

    if (disableFallback) {
      throw primaryErr;
    }

    if (engine === 'cloud_api') {
      const isConfigError = /api key.*(?:missing|invalid|not valid)/i.test(primaryErr.message);
      if (isConfigError) {
        throw primaryErr;
      }
    }

    if (engine === 'cloud_api') {
      try {
        const nanoStatus = await checkNanoStatus();
        if (nanoStatus.available && nanoStatus.isReady !== false) {
          console.log('[Background] Cloud API failed, falling back to local Gemini Nano.');
          const reply = await generateViaNano(promptText, customInstructions, mode);
          return { reply, engine: 'Gemini Nano (fallback)' };
        }
      } catch (nanoErr) {
        console.warn('[Background] Fallback to Gemini Nano failed:', nanoErr);
      }
      throw primaryErr;
    }

    if (engine === 'nano') {
      try {
        const { apiKey = '' } = await chrome.storage.local.get(['apiKey']);
        if (apiKey.trim().length > 10) {
          console.log('[Background] Gemini Nano failed, falling back to Cloud API.');
          const { text, usedModel } = await generateViaCloudAPI(promptText, customInstructions, mode);
          return { reply: text, engine: `Cloud API (${usedModel}) (fallback)` };
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

      const existingTab = await findGeminiTab();
      if (existingTab) {
        try {
          console.log('[Background] Gemini Nano failed, falling back to existing Gemini Web Tab.');
          const reply = await generateViaWebTab(promptText);
          return { reply, engine: 'Gemini Web Tab (fallback)' };
        } catch (tabErr) {
          console.warn('[Background] Web Tab fallback failed:', tabErr);
        }
      }

      throw primaryErr;
    }

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
        const { apiKey = '' } = await chrome.storage.local.get(['apiKey']);
        if (apiKey.trim().length > 10) {
          console.log('[Background] Headless failed, falling back to Cloud API.');
          const { text, usedModel } = await generateViaCloudAPI(promptText, customInstructions, mode);
          return { reply: text, engine: `Cloud API (${usedModel}) (fallback)` };
        }
      } catch (cloudErr) {
        console.warn('[Background] Fallback to Cloud API failed:', cloudErr);
      }

      const existingTab = await findGeminiTab();
      if (existingTab) {
        try {
          console.log('[Background] Headless failed, falling back to existing Gemini Web Tab.');
          const reply = await generateViaWebTab(promptText);
          return { reply, engine: 'Gemini Web Tab (fallback)' };
        } catch (tabErr) {
          console.warn('[Background] Web Tab fallback failed:', tabErr);
        }
      }

      throw primaryErr;
    }

    if (engine === 'web_tab') {
      try {
        const { apiKey = '' } = await chrome.storage.local.get(['apiKey']);
        if (apiKey.trim().length > 10) {
          console.log('[Background] Web Tab failed, falling back to Cloud API.');
          const { text, usedModel } = await generateViaCloudAPI(promptText, customInstructions, mode);
          return { reply: text, engine: `Cloud API (${usedModel}) (fallback)` };
        }
      } catch (cloudErr) {
        console.warn('[Background] Fallback to Cloud API failed:', cloudErr);
      }

      try {
        const nanoStatus = await checkNanoStatus();
        if (nanoStatus.available && nanoStatus.isReady !== false) {
          console.log('[Background] Web Tab failed, falling back to Gemini Nano.');
          const reply = await generateViaNano(promptText, customInstructions, mode);
          return { reply, engine: 'Gemini Nano (fallback)' };
        }
      } catch (nanoErr) {
        console.warn('[Background] Fallback to Gemini Nano failed:', nanoErr);
      }

      throw primaryErr;
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
      if (message.type === 'CHECK_ENGINE_STATUS') {
        let { engine = 'cloud_api', apiKey = '', cloudModel = 'gemini-3.5-flash-lite' } = await chrome.storage.local.get(['engine', 'apiKey', 'cloudModel']);

        if (!cloudModel || /gemma|1\.5|2\.0|2\.5-flash-lite/i.test(cloudModel)) {
          cloudModel = 'gemini-3.5-flash-lite';
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

      if (message.type === 'VALIDATE_CLOUD_API_KEY') {
        const { apiKey = '', model = 'gemini-3.5-flash-lite' } = message.payload || {};
        const validation = await validateCloudAPIKey(apiKey, model);
        return sendResponse(validation);
      }

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

      if (message.type === 'GENERATE_REPLY') {
        const settings = await chrome.storage.local.get(['engine', 'customInstructions']);
        const engine = message.payload?.engineOverride || settings.engine || 'cloud_api';
        const disableFallback = !!message.payload?.disableFallback;
        const customInstructions = settings.customInstructions || message.payload?.customInstructions || '';
        const promptText = buildGeminiPrompt({
          ...message.payload,
          customInstructions
        });

        const result = await executeWithFallback(engine, promptText, customInstructions, 'reply', disableFallback);

        return sendResponse({
          success: true,
          reply: cleanGeneratedReply(result.reply, customInstructions, 'reply'),
          engine: result.engine
        });
      }

      if (message.type === 'GENERATE_POST') {
        const settings = await chrome.storage.local.get(['engine', 'customInstructions']);
        const engine = message.payload?.engineOverride || settings.engine || 'cloud_api';
        const disableFallback = !!message.payload?.disableFallback;
        const customInstructions = settings.customInstructions || message.payload?.customInstructions || '';
        const promptText = buildGeminiPostPrompt({
          ...message.payload,
          customInstructions
        });

        const result = await executeWithFallback(engine, promptText, customInstructions, 'post', disableFallback);

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

function hasNoEmojiInstruction(instructions) {
  if (!instructions) return false;
  return /(?:no|zero|without|avoid|don'?t\s+use|do\s+not\s+use|never\s+use|free\s+of|stop\s+using|disallow)\s+emojis?/i.test(instructions);
}

function hasNoHashtagInstruction(instructions) {
  if (!instructions) return false;
  return /(?:no|zero|without|avoid|don'?t\s+use|do\s+not\s+use|never\s+use|free\s+of|stop\s+using|disallow)\s+hashtags?/i.test(instructions);
}

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

function cleanGeneratedReply(rawText, customInstructions = '', mode = 'reply') {
  if (!rawText) return '';
  let text = rawText.trim();

  const hasExplicitScratchpadLabels = /(?:\*+\s*(?:User wants|Original [Tt]weet|Target|Constraints|Tone|Topic|Goal|Category|Platform|Persona|Witty angles|Analyzing|Evaluating|Draft|Thinking|Thought)|Option\s*\d|\*+Option\s*\d)/i.test(text);
  const hasLongBulletScratchpad = text.length > 280 && (text.split('\n').filter(l => /^\s*[*•-]/.test(l)).length >= 2);
  const hasScratchpad = hasExplicitScratchpadLabels || hasLongBulletScratchpad;

  if (hasScratchpad) {
    const optionMatches = [...text.matchAll(/(?:^|[\n*•-])\s*\*?\*?Option\s*(\d)\*?:\*?\s*([^\n*]+)/gi)];
    if (optionMatches.length > 0) {
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

    const bulletQuotes = [...text.matchAll(/(?:^|[\n*•-])\s*["“]([^"”\n]{15,260})["”]/g)];
    if (bulletQuotes.length > 0) {
      const validQuotes = bulletQuotes.filter(q => {
        const t = q[1].trim();
        return !t.toLowerCase().includes('original tweet') && t.length >= 15;
      });
      if (validQuotes.length > 0) {
        return sanitizeTweetOutput(validQuotes[validQuotes.length - 1][1].trim(), customInstructions);
      }
    }

    text = text.replace(/(?:^|\n)\s*[*•-]\s*(?:User wants|Original [Tt]weet|Target|Constraints|Tone|Topic|Goal|Category|Platform|Persona|Subject|Sentiment|Witty angles|Analyzing|Evaluating|Draft|Thinking)[^:\n]*:[^\n]*/gi, '');
    text = text.replace(/[*•-]\s*\*?Option\s*\d\*?:?/gi, '');
    text = text.replace(/Wait,\s*let'?s\s*make\s*it\s*even\s*more[^".\n]*[.:]?/gi, '');
    text = text.replace(/Under\s*\d+\s*chars\?\s*Yes\./gi, '');
    text = text.replace(/No\s*(?:hashtags|quotation)[^?]*\?\s*Yes\./gi, '');
    text = text.replace(/Natural\/Human\?\s*Yes\./gi, '');
  }

  return sanitizeTweetOutput(text, customInstructions);
}

function sanitizeTweetOutput(text, customInstructions = '') {
  let cleaned = text.trim();

  cleaned = cleaned.replace(/^(?:sure(?: thing)?[!,.]?\s*)?(?:here(?:'s| is) (?:a |the )?(?:suggested |quick |twitter |witty )?(?:reply|tweet|post):?\s*|twitter (?:reply|post):?\s*|suggested (?:reply|post):?\s*|(?:reply|tweet):?\s*)/i, '').trim();

  if ((cleaned.startsWith('"') && cleaned.endsWith('"')) || (cleaned.startsWith('“') && cleaned.endsWith('”')) || (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
    cleaned = cleaned.slice(1, -1).trim();
  }

  cleaned = cleaned.replace(/^\*+\s*/, '').replace(/\s*\*+$/, '').trim();

  cleaned = cleaned
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (hasNoEmojiInstruction(customInstructions)) {
    cleaned = cleaned
      .replace(/[\p{Extended_Pictographic}\uFE00-\uFE0F]/ug, '')
      .replace(/[ \t]+([,.!?])/g, '$1')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
  }

  if (hasNoHashtagInstruction(customInstructions)) {
    cleaned = cleaned
      .replace(/#[A-Za-z0-9_]+/g, '')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
  }

  if (cleaned.length > 280) {
    const cut = cleaned.substring(0, 275);
    const lastPunct = Math.max(cut.lastIndexOf('.'), cut.lastIndexOf('!'), cut.lastIndexOf('?'));
    if (lastPunct > 60) {
      cleaned = cut.substring(0, lastPunct + 1).trim();
    } else {
      const lastSpace = Math.max(cut.lastIndexOf(' '), cut.lastIndexOf('\n'));
      cleaned = (lastSpace > 60 ? cut.substring(0, lastSpace).trim() : cut) + '...';
    }
  }

  return cleaned;
}

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

function cleanGeneratedPost(rawText, customInstructions = '') {
  if (!rawText) return '';
  return cleanGeneratedReply(rawText, customInstructions, 'post');
}