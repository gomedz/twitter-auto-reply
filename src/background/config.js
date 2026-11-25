// config.js - Extension Constants, Defaults & Migration Setup

import { extractCustomCharLimit } from './prompts.js';
import { normalizeCloudModel } from './engines/cloud.js';

export const GEMINI_URL = 'https://gemini.google.com/app';
export const LEGACY_DEFAULT_CUSTOM_INSTRUCTIONS = 'Keep output concise, under 260 characters. No hashtags. No quotation marks. Be natural, authentic, and human.';

export const DEFAULT_CUSTOM_API = {
  preset: 'openai',
  format: 'openai', // 'openai' | 'anthropic'
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
  customHeaders: ''
};

export const DEFAULT_SETTINGS = {
  engine: 'cloud_api', // 'cloud_api' | 'custom_api' | 'nano' | 'headless' | 'web_tab'
  defaultTone: 'quick',
  defaultPostStyle: 'engaging',
  customInstructions: 'Keep output concise. No hashtags. No quotation marks. Be natural, authentic, and human.',
  maxReplyLength: 280,
  maxPostLength: 280,
  autoOpenGemini: true,
  autoCloseTab: true,
  showFloatingHud: true,
  apiKey: '',
  cloudModel: 'gemini-3.5-flash-lite',
  cloudApiVersion: 'v1beta',
  customApi: { ...DEFAULT_CUSTOM_API }
};

export async function setupExtension() {
  const existing = await chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS));
  const toSet = {};
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    if (existing[k] === undefined) {
      toSet[k] = k === 'customApi' ? { ...DEFAULT_CUSTOM_API } : v;
    }
  }
  if (existing.customApi && typeof existing.customApi === 'object') {
    toSet.customApi = { ...DEFAULT_CUSTOM_API, ...existing.customApi };
  }
  // Migrate legacy default customInstructions that hardcoded "under 260 characters."
  if (existing.customInstructions === LEGACY_DEFAULT_CUSTOM_INSTRUCTIONS) {
    toSet.customInstructions = DEFAULT_SETTINGS.customInstructions;
  }
  // Preserve any explicit inline length from customInstructions during first-time v2.0.0 migration
  if (existing.maxReplyLength === undefined) {
    const inlineLimit = extractCustomCharLimit(existing.customInstructions, null);
    toSet.maxReplyLength = (inlineLimit && inlineLimit !== 260) ? inlineLimit : 280;
  }
  if (existing.maxPostLength === undefined) {
    const inlineLimit = extractCustomCharLimit(existing.customInstructions, null);
    toSet.maxPostLength = (inlineLimit && inlineLimit !== 260) ? inlineLimit : 280;
  }
  // Auto-migrate deprecated / legacy models (1.5, 2.0, 2.5, 3.5-flash, 3.6-flash, 3.7-flash)
  if (existing.cloudModel) {
    const migrated = normalizeCloudModel(existing.cloudModel);
    if (migrated !== existing.cloudModel) {
      toSet.cloudModel = migrated;
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
