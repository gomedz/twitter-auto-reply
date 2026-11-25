// cloud.js - Google Gemini Cloud REST API Engine

import {
  resolveEffectiveMaxLength,
  stripConflictingLengthClause,
  hasNoEmojiInstruction,
  computeOutputTokenBudget
} from '../prompts.js';

export function normalizeCloudModel(modelName) {
  const raw = String(modelName || '').trim();
  if (!raw) return 'gemini-3.5-flash-lite';
  if (/2\.5-pro/i.test(raw)) return 'gemini-4-argon';
  if (/3\.5-flash(?!-lite)|3\.6-flash|3\.7-flash/i.test(raw)) return 'gemini-4-hydrogen';
  if (/gemma|1\.5|2\.0|2\.5-flash/i.test(raw)) return 'gemini-3.5-flash-lite';
  return raw;
}

export function buildThinkingConfigForModel(modelName) {
  if (/gemini-4-/i.test(modelName)) {
    // Gemini 4 models support LOW, MEDIUM, HIGH (MINIMAL is rejected)
    return { thinkingLevel: 'LOW' };
  }
  if (/gemini-3\.5-flash-lite/i.test(modelName)) {
    return { thinkingLevel: 'MINIMAL' };
  }
  if (/gemini-3\./i.test(modelName)) {
    return { thinkingLevel: 'LOW' };
  }
  if (/gemini-2\.5-flash/i.test(modelName)) {
    return { thinkingBudget: 0 };
  }
  return null;
}

export function buildCloudGenerationConfig(modelName, maxOutputTokens, defaultTemp = 0.85) {
  const cfg = { maxOutputTokens };
  // Gemini 4 & 3.5 Flash-Lite ignore or deprecate temperature/topP/topK
  if (!/gemini-4-|gemini-3\.5-flash-lite/i.test(modelName)) {
    cfg.temperature = defaultTemp;
  }
  const thinkingCfg = buildThinkingConfigForModel(modelName);
  if (thinkingCfg) {
    cfg.thinkingConfig = thinkingCfg;
  }
  return cfg;
}

export async function generateViaCloudAPI(promptText, customInstructions = '', mode = 'reply', maxLength = null) {
  const {
    apiKey = '',
    cloudModel = 'gemini-3.5-flash-lite'
  } = await chrome.storage.local.get(['apiKey', 'cloudModel']);
  const cleanKey = apiKey.trim();

  if (!cleanKey) {
    throw new Error('Gemini API key is missing. Please open extension settings and configure your Google Gemini API key.');
  }

  let targetModel = normalizeCloudModel(cloudModel);
  if (targetModel !== cloudModel) {
    await chrome.storage.local.set({ cloudModel: targetModel });
  }

  const effectiveLimit = resolveEffectiveMaxLength(maxLength, customInstructions, 260);
  const promptRules = stripConflictingLengthClause(customInstructions, maxLength !== null && maxLength !== undefined);
  const longFormHint = effectiveLimit > 280 ? ' Long-form post/reply allowed; use clean line breaks if helpful.' : '';
  let systemInstructionText = mode === 'post'
    ? `You are an elite Twitter (X) post creator. Output ONLY the single final tweet text to post. NEVER output brainstorming, reasoning, options (Option 1/2), notes, or quotes. Output plain text strictly under ${effectiveLimit} characters.${longFormHint} Never start or begin the tweet with emojis. Plain text only without HTML/XML tags, citations, or internal links.`
    : `You are an authentic Twitter (X) reply generator. Output ONLY the single final tweet text to post. NEVER output brainstorming, reasoning, options (Option 1/2), notes, or quotes. Output plain text strictly under ${effectiveLimit} characters.${longFormHint} Never start or begin the reply with emojis. Plain text only without HTML/XML tags, citations, or internal links.`;

  if (promptRules) {
    systemInstructionText += ' STRICT USER RULES: ' + promptRules;
  }
  if (hasNoEmojiInstruction(customInstructions)) {
    systemInstructionText += ' Absolutely NO emojis. Plain text only.';
  }

  // Primary candidate models ordered by low latency & current availability
  const uniqueCandidateModels = Array.from(new Set([
    targetModel,
    'gemini-3.5-flash-lite',
    'gemini-4-hydrogen',
    'gemini-4-argon',
    'gemini-3.8-flash'
  ])).filter(Boolean);

  let lastErrorDetail = '';
  for (const model of uniqueCandidateModels) {
    const isReasoning = /gemini-4-|pro/i.test(model);
    const generationConfig = buildCloudGenerationConfig(
      model,
      computeOutputTokenBudget(effectiveLimit, isReasoning),
      0.85
    );

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
    const timeoutMs = /gemini-4-(?:carbon|neon|argon)|pro/i.test(model) ? 12000 : 8000;

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

      const isAuthOrKeyError =
        response.status === 401 ||
        response.status === 403 ||
        (response.status === 400 && /API_KEY_INVALID|API key not valid|not valid|API key expired/i.test(lastErrorDetail));

      if (isAuthOrKeyError) {
        throw new Error(`Google API Key is invalid or unauthorized (${response.status}): ${lastErrorDetail}`);
      }

      console.warn(`[Background] Model '${model}' failed after ${Date.now() - reqStart}ms (${response.status}: ${lastErrorDetail}). Trying next candidate...`);
    } catch (fetchErr) {
      if (fetchErr.message && /API Key is invalid|API key is missing|unauthorized/i.test(fetchErr.message)) {
        throw fetchErr;
      }
      lastErrorDetail = fetchErr.message;
      console.warn(`[Background] Model '${model}' encountered error after ${Date.now() - reqStart}ms: ${fetchErr.message}. Trying next candidate...`);
    }
  }

  throw new Error(`Gemini Cloud API Error: ${lastErrorDetail}`);
}

export async function validateCloudAPIKey(apiKey, requestedModel = 'gemini-3.5-flash-lite') {
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

  const modelToTest = normalizeCloudModel(requestedModel);

  const generationConfig = buildCloudGenerationConfig(
    modelToTest,
    /gemini-4-|pro/i.test(modelToTest) ? 256 : 32,
    0.7
  );

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
      const fallback = availableModels.find(m => m.includes('3.5-flash-lite') || m.includes('4-hydrogen') || m.includes('4-argon')) || 'gemini-3.5-flash-lite';
      return {
        valid: true,
        model: fallback,
        apiVersion: 'v1beta',
        message: `✓ Valid Key! Switched to active model ${fallback}`
      };
    }

    if (testRes.status === 400 || testRes.status === 401 || testRes.status === 403) {
      return {
        valid: false,
        message: `Key rejected or unauthorized (${testRes.status}): ${errDetail.substring(0, 100)}`
      };
    }

    return {
      valid: false,
      message: `Model check failed (HTTP ${testRes.status}): ${errDetail.substring(0, 80)}`
    };
  } catch (genErr) {
    return {
      valid: false,
      message: `Network/timeout error testing ${modelToTest}: ${genErr.message}`
    };
  }
}
