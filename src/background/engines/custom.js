// custom.js - Custom API Engine (OpenAI-Compatible & Anthropic-Compatible)

import { DEFAULT_CUSTOM_API } from '../config.js';
import {
  resolveEffectiveMaxLength,
  stripConflictingLengthClause,
  hasNoEmojiInstruction,
  computeOutputTokenBudget
} from '../prompts.js';

export const RESTRICTED_CUSTOM_HEADERS = new Set([
  'host', 'origin', 'referer', 'content-length', 'connection', 'cookie', 'user-agent'
]);

export function isLoopbackHostname(hostname) {
  const host = String(hostname || '').toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1';
}

export function normalizeCustomApiUrl(rawUrl, format = 'openai', purpose = 'completion') {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) {
    throw new Error('Custom API Endpoint URL is missing. Please configure it in extension settings.');
  }

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch (e) {
    throw new Error('Custom API URL is invalid. Please enter a full URL such as https://api.openai.com/v1');
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Custom API URL must start with https:// (or http:// for localhost).');
  }

  if (parsed.protocol === 'http:' && !isLoopbackHostname(parsed.hostname)) {
    throw new Error('Remote Custom API URLs must use https:// for security (http:// is only allowed for localhost / 127.0.0.1).');
  }

  let pathname = parsed.pathname.replace(/\/+$/, '');
  const origin = parsed.origin;

  if (purpose === 'models') {
    pathname = pathname
      .replace(/\/chat\/completions$/i, '')
      .replace(/\/messages$/i, '')
      .replace(/\/models$/i, '');
    if (!pathname) pathname = '/v1';
    return {
      url: `${origin}${pathname}/models`,
      originPattern: `${origin}/*`,
      isLocal: isLoopbackHostname(parsed.hostname)
    };
  }

  if (format === 'anthropic') {
    if (!/\/messages$/i.test(pathname)) {
      if (!pathname) pathname = '/v1';
      pathname = `${pathname}/messages`;
    }
  } else {
    if (!/\/chat\/completions$/i.test(pathname)) {
      if (!pathname) pathname = '/v1';
      pathname = `${pathname}/chat/completions`;
    }
  }

  return {
    url: `${origin}${pathname}${parsed.search || ''}`,
    originPattern: `${origin}/*`,
    isLocal: isLoopbackHostname(parsed.hostname)
  };
}

export function parseCustomHeaders(rawHeaders) {
  const result = {};
  const trimmed = String(rawHeaders || '').trim();
  if (!trimmed) return result;
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch (e) {
    throw new Error('Custom API headers must be valid JSON (e.g. {"X-Title": "Twitter AI"}).');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Custom API headers must be a JSON object.');
  }
  for (const [k, v] of Object.entries(parsed)) {
    const cleanKey = String(k).trim();
    if (!cleanKey || RESTRICTED_CUSTOM_HEADERS.has(cleanKey.toLowerCase())) continue;
    if (v !== undefined && v !== null) {
      result[cleanKey] = String(v);
    }
  }
  return result;
}

export async function checkCustomApiOriginPermission(originPattern) {
  if (!chrome?.permissions?.contains) return true;
  try {
    return await chrome.permissions.contains({ origins: [originPattern] });
  } catch (e) {
    return false;
  }
}

export function extractCustomApiText(data, format = 'openai') {
  let raw = '';
  if (format === 'anthropic') {
    if (Array.isArray(data?.content)) {
      raw = data.content
        .filter(b => b && b.type === 'text' && typeof b.text === 'string')
        .map(b => b.text)
        .join('');
    } else if (typeof data?.completion === 'string') {
      raw = data.completion;
    }
  } else {
    const msgContent = data?.choices?.[0]?.message?.content;
    if (typeof msgContent === 'string') {
      raw = msgContent;
    } else if (Array.isArray(msgContent)) {
      raw = msgContent
        .filter(p => p && typeof p.text === 'string')
        .map(p => p.text)
        .join('');
    } else if (typeof data?.choices?.[0]?.text === 'string') {
      raw = data.choices[0].text;
    } else if (typeof data?.message?.content === 'string') {
      raw = data.message.content;
    }
  }
  return raw.replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, '').trim();
}

export async function generateViaCustomAPI(promptText, customInstructions = '', mode = 'reply', maxLength = null) {
  const stored = await chrome.storage.local.get(['customApi']);
  const cfg = { ...DEFAULT_CUSTOM_API, ...(stored?.customApi || {}) };
  const format = cfg.format === 'anthropic' ? 'anthropic' : 'openai';
  const model = String(cfg.model || '').trim();
  const cleanKey = String(cfg.apiKey || '').trim();

  if (!model) {
    throw new Error('Custom API model name is missing. Please set a model in Custom API settings.');
  }

  const { url, originPattern, isLocal } = normalizeCustomApiUrl(cfg.baseUrl, format, 'completion');
  const extraHeaders = parseCustomHeaders(cfg.customHeaders);

  if (!isLocal && !cleanKey && Object.keys(extraHeaders).length === 0) {
    throw new Error('Custom API key is missing for remote endpoint. Enter your API key in settings.');
  }

  const hasPermission = await checkCustomApiOriginPermission(originPattern);
  if (!hasPermission) {
    throw new Error(`Custom API host permission not granted for ${originPattern}. Open settings and click "Verify & Save" to grant access.`);
  }

  const effectiveLimit = resolveEffectiveMaxLength(maxLength, customInstructions, 260);
  const promptRules = stripConflictingLengthClause(customInstructions, maxLength !== null && maxLength !== undefined);
  const longFormHint = effectiveLimit > 280 ? ' Long-form post/reply allowed; use clean line breaks if helpful.' : '';
  let systemContent = mode === 'post'
    ? `You are an elite Twitter (X) post creator. Output ONLY the single final tweet text to post. NEVER output brainstorming, reasoning, options, notes, or quotes. Output plain text strictly under ${effectiveLimit} characters.${longFormHint} Never start or begin the tweet with emojis. Plain text only without HTML/XML tags.`
    : `You are an authentic Twitter (X) reply generator. Output ONLY the single final reply text to post. NEVER output brainstorming, reasoning, options, notes, or quotes. Output plain text strictly under ${effectiveLimit} characters.${longFormHint} Never start or begin the reply with emojis. Plain text only without HTML/XML tags.`;

  if (promptRules) {
    systemContent += ' STRICT USER RULES: ' + promptRules;
  }
  if (hasNoEmojiInstruction(customInstructions)) {
    systemContent += ' Absolutely NO emojis. Plain text only.';
  }

  const headers = {
    'Content-Type': 'application/json',
    ...extraHeaders
  };

  const tokenBudget = computeOutputTokenBudget(effectiveLimit, /r1|reason|think|o1|o3|o4/i.test(model));
  let bodyPayload;

  if (format === 'anthropic') {
    if (cleanKey) headers['x-api-key'] = cleanKey;
    headers['anthropic-version'] = headers['anthropic-version'] || '2023-06-01';
    headers['anthropic-dangerous-direct-browser-access'] = 'true';
    bodyPayload = {
      model,
      system: systemContent,
      messages: [{ role: 'user', content: promptText }],
      max_tokens: tokenBudget,
      temperature: 0.8
    };
  } else {
    if (cleanKey) headers['Authorization'] = `Bearer ${cleanKey}`;
    bodyPayload = {
      model,
      messages: [
        { role: 'system', content: systemContent },
        { role: 'user', content: promptText }
      ],
      max_tokens: tokenBudget,
      temperature: 0.8
    };
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(bodyPayload),
    signal: AbortSignal.timeout(20000)
  });

  if (!response.ok) {
    const errJson = await response.json().catch(() => ({}));
    const detail = errJson.error?.message || errJson.message || `HTTP ${response.status} ${response.statusText}`;
    if (response.status === 401 || response.status === 403) {
      throw new Error(`Custom API authentication/permission failed (${response.status}): ${detail}`);
    }
    if (response.status === 404) {
      throw new Error(`Custom API endpoint or model not found (404): ${detail}`);
    }
    throw new Error(`Custom API Error (${response.status}): ${detail}`);
  }

  const data = await response.json();
  const text = extractCustomApiText(data, format);
  if (!text) {
    throw new Error('Received empty response from Custom API.');
  }

  return { text, model };
}

export async function validateCustomAPIConfig(config = {}) {
  const cfg = { ...DEFAULT_CUSTOM_API, ...config };
  const format = cfg.format === 'anthropic' ? 'anthropic' : 'openai';
  const model = String(cfg.model || '').trim();
  const cleanKey = String(cfg.apiKey || '').trim();

  if (!model) {
    return { valid: false, message: 'Please enter a model name first.' };
  }

  let normalized;
  try {
    normalized = normalizeCustomApiUrl(cfg.baseUrl, format, 'completion');
  } catch (e) {
    return { valid: false, message: e.message };
  }

  let extraHeaders;
  try {
    extraHeaders = parseCustomHeaders(cfg.customHeaders);
  } catch (e) {
    return { valid: false, message: e.message };
  }

  if (!normalized.isLocal && !cleanKey && Object.keys(extraHeaders).length === 0) {
    return {
      valid: false,
      message: 'API key is required for remote endpoints (optional only for localhost).'
    };
  }

  const hasPermission = await checkCustomApiOriginPermission(normalized.originPattern);
  if (!hasPermission) {
    return {
      valid: false,
      needsPermission: true,
      originPattern: normalized.originPattern,
      message: `Permission required for ${normalized.originPattern}.`
    };
  }

  const headers = { 'Content-Type': 'application/json', ...extraHeaders };
  let bodyPayload;
  if (format === 'anthropic') {
    if (cleanKey) headers['x-api-key'] = cleanKey;
    headers['anthropic-version'] = headers['anthropic-version'] || '2023-06-01';
    headers['anthropic-dangerous-direct-browser-access'] = 'true';
    bodyPayload = {
      model,
      messages: [{ role: 'user', content: 'Reply with OK' }],
      max_tokens: 16,
      temperature: 0.2
    };
  } else {
    if (cleanKey) headers['Authorization'] = `Bearer ${cleanKey}`;
    bodyPayload = {
      model,
      messages: [{ role: 'user', content: 'Reply with OK' }],
      max_tokens: 16,
      temperature: 0.2
    };
  }

  try {
    const res = await fetch(normalized.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(bodyPayload),
      signal: AbortSignal.timeout(12000)
    });

    if (res.ok) {
      return {
        valid: true,
        model,
        resolvedUrl: normalized.url,
        message: `✓ Connected to ${model}`
      };
    }

    const errJson = await res.json().catch(() => ({}));
    const detail = errJson.error?.message || errJson.message || `HTTP ${res.status} ${res.statusText}`;
    return {
      valid: false,
      message: `Endpoint error (${res.status}): ${String(detail).substring(0, 120)}`
    };
  } catch (err) {
    return {
      valid: false,
      message: `Connection failed: ${err.message}`
    };
  }
}

export async function fetchCustomAPIModels(config = {}) {
  const cfg = { ...DEFAULT_CUSTOM_API, ...config };
  const format = cfg.format === 'anthropic' ? 'anthropic' : 'openai';
  const cleanKey = String(cfg.apiKey || '').trim();

  const normalized = normalizeCustomApiUrl(cfg.baseUrl, format, 'models');
  const hasPermission = await checkCustomApiOriginPermission(normalized.originPattern);
  if (!hasPermission) {
    throw new Error(`Permission required for ${normalized.originPattern}.`);
  }

  const extraHeaders = parseCustomHeaders(cfg.customHeaders);
  const headers = { ...extraHeaders };
  if (format === 'anthropic') {
    if (cleanKey) headers['x-api-key'] = cleanKey;
    headers['anthropic-version'] = headers['anthropic-version'] || '2023-06-01';
  } else if (cleanKey) {
    headers['Authorization'] = `Bearer ${cleanKey}`;
  }

  const res = await fetch(normalized.url, {
    method: 'GET',
    headers,
    signal: AbortSignal.timeout(8000)
  });

  if (!res.ok) {
    throw new Error(`Model list returned HTTP ${res.status}`);
  }

  const data = await res.json();
  const list = Array.isArray(data?.data)
    ? data.data.map(m => m.id || m.name).filter(Boolean)
    : (Array.isArray(data?.models) ? data.models.map(m => m.id || m.name || m.model).filter(Boolean) : []);

  return Array.from(new Set(list)).slice(0, 100);
}
