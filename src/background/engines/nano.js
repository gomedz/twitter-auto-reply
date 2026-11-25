// nano.js - Chrome Built-in Gemini Nano via Offscreen Document

import {
  resolveEffectiveMaxLength,
  stripConflictingLengthClause,
  hasNoEmojiInstruction
} from '../prompts.js';

let creatingOffscreen = null;

export async function ensureOffscreenDocument() {
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
        url: 'src/offscreen/offscreen.html',
        reasons: ['DOM_SCRAPING'],
        justification: 'Running on-device Gemini Nano Prompt API'
      });
      await creatingOffscreen;
    } finally {
      creatingOffscreen = null;
    }
  }
}

export async function checkNanoStatus() {
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

export async function generateViaNano(promptText, customInstructions = '', mode = 'reply', maxLength = null) {
  const effectiveLimit = resolveEffectiveMaxLength(maxLength, customInstructions, 260);
  const promptRules = stripConflictingLengthClause(customInstructions, maxLength !== null && maxLength !== undefined);
  let systemContent = mode === 'post'
    ? `You are an elite Twitter (X) creator. Output ONLY the single final tweet text to post. Keep output concise, strictly under ${effectiveLimit} characters, punchy, no hashtags, no quotes. Never start or begin the tweet with emojis. Plain text only without HTML/XML tags.`
    : `You are an authentic Twitter (X) assistant. Output ONLY the single final reply to post. Keep output concise, strictly under ${effectiveLimit} characters, natural, no hashtags, no quotes. Never start or begin the reply with emojis. Plain text only without HTML/XML tags.`;

  if (promptRules) {
    systemContent += ` ABSOLUTE MANDATORY RULES (override everything else, no exceptions): ${promptRules}`;
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
