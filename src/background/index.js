// index.js - Multi-Engine Service Worker Entrypoint & Fallback Pipeline

import { GEMINI_URL, DEFAULT_CUSTOM_API, setupExtension } from './config.js';
import {
  resolveEffectiveMaxLength,
  buildGeminiPrompt,
  buildGeminiPostPrompt,
  cleanGeneratedReply,
  cleanGeneratedPost
} from './prompts.js';
import { checkNanoStatus, generateViaNano } from './engines/nano.js';
import { normalizeCloudModel, generateViaCloudAPI, validateCloudAPIKey } from './engines/cloud.js';
import {
  normalizeCustomApiUrl,
  parseCustomHeaders,
  checkCustomApiOriginPermission,
  generateViaCustomAPI,
  validateCustomAPIConfig,
  fetchCustomAPIModels
} from './engines/custom.js';
import { getHeadlessSessionTokens, generateViaHeadless } from './engines/headless.js';
import { findGeminiTab, openGeminiTab, sendToGeminiTab, generateViaWebTab } from './engines/webtab.js';

chrome.runtime.onInstalled.addListener(setupExtension);
chrome.runtime.onStartup.addListener(setupExtension);

export async function executeWithFallback(engine, promptText, customInstructions = '', mode = 'reply', disableFallback = false, maxLength = null) {
  try {
    if (engine === 'nano') {
      const reply = await generateViaNano(promptText, customInstructions, mode, maxLength);
      return { reply, engine: 'Gemini Nano' };
    }
    if (engine === 'cloud_api') {
      const { text, usedModel } = await generateViaCloudAPI(promptText, customInstructions, mode, maxLength);
      return { reply: text, engine: `Cloud API (${usedModel})` };
    }
    if (engine === 'custom_api') {
      const { text, model } = await generateViaCustomAPI(promptText, customInstructions, mode, maxLength);
      return { reply: text, engine: `Custom API (${model})` };
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
      const isConfigError = /api key.*(?:missing|invalid|not valid|expired|unauthorized)|permission_denied/i.test(primaryErr.message);
      if (isConfigError) {
        throw primaryErr;
      }
    }

    if (engine === 'custom_api') {
      const isCustomConfigError = /custom api.*(?:missing|invalid|must use https|not granted|authentication\/permission failed|not found)|permission required/i.test(primaryErr.message);
      if (isCustomConfigError) {
        throw primaryErr;
      }

      try {
        const { apiKey = '' } = await chrome.storage.local.get(['apiKey']);
        if (apiKey.trim().length > 10) {
          console.log('[Background] Custom API failed, falling back to Cloud API.');
          const { text, usedModel } = await generateViaCloudAPI(promptText, customInstructions, mode, maxLength);
          return { reply: text, engine: `Cloud API (${usedModel}) (fallback)` };
        }
      } catch (cloudErr) {
        console.warn('[Background] Fallback to Cloud API failed:', cloudErr);
      }

      try {
        const nanoStatus = await checkNanoStatus();
        if (nanoStatus.available && nanoStatus.isReady !== false) {
          console.log('[Background] Custom API failed, falling back to local Gemini Nano.');
          const reply = await generateViaNano(promptText, customInstructions, mode, maxLength);
          return { reply, engine: 'Gemini Nano (fallback)' };
        }
      } catch (nanoErr) {
        console.warn('[Background] Fallback to Gemini Nano failed:', nanoErr);
      }

      try {
        console.log('[Background] Custom API failed, attempting silent Headless fallback.');
        const reply = await generateViaHeadless(promptText);
        return { reply, engine: 'Headless Web (fallback)' };
      } catch (headlessErr) {
        console.warn('[Background] Silent Headless fallback failed:', headlessErr);
      }

      const existingTab = await findGeminiTab();
      if (existingTab) {
        try {
          console.log('[Background] Custom API failed, falling back to existing Gemini Web Tab.');
          const reply = await generateViaWebTab(promptText);
          return { reply, engine: 'Gemini Web Tab (fallback)' };
        } catch (tabErr) {
          console.warn('[Background] Web Tab fallback failed:', tabErr);
        }
      }

      throw primaryErr;
    }

    if (engine === 'cloud_api') {
      try {
        const nanoStatus = await checkNanoStatus();
        if (nanoStatus.available && nanoStatus.isReady !== false) {
          console.log('[Background] Cloud API failed, falling back to local Gemini Nano.');
          const reply = await generateViaNano(promptText, customInstructions, mode, maxLength);
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

      const existingTab = await findGeminiTab();
      if (existingTab) {
        try {
          console.log('[Background] Cloud API failed, falling back to existing Gemini Web Tab.');
          const reply = await generateViaWebTab(promptText);
          return { reply, engine: 'Gemini Web Tab (fallback)' };
        } catch (tabErr) {
          console.warn('[Background] Web Tab fallback failed:', tabErr);
        }
      }

      throw primaryErr;
    }

    if (engine === 'nano') {
      try {
        const { apiKey = '' } = await chrome.storage.local.get(['apiKey']);
        if (apiKey.trim().length > 10) {
          console.log('[Background] Gemini Nano failed, falling back to Cloud API.');
          const { text, usedModel } = await generateViaCloudAPI(promptText, customInstructions, mode, maxLength);
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
          const reply = await generateViaNano(promptText, customInstructions, mode, maxLength);
          return { reply, engine: 'Gemini Nano (fallback)' };
        }
      } catch (nanoErr) {
        console.warn('[Background] Fallback to Gemini Nano failed:', nanoErr);
      }

      try {
        const { apiKey = '' } = await chrome.storage.local.get(['apiKey']);
        if (apiKey.trim().length > 10) {
          console.log('[Background] Headless failed, falling back to Cloud API.');
          const { text, usedModel } = await generateViaCloudAPI(promptText, customInstructions, mode, maxLength);
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
          const { text, usedModel } = await generateViaCloudAPI(promptText, customInstructions, mode, maxLength);
          return { reply: text, engine: `Cloud API (${usedModel}) (fallback)` };
        }
      } catch (cloudErr) {
        console.warn('[Background] Fallback to Cloud API failed:', cloudErr);
      }

      try {
        const nanoStatus = await checkNanoStatus();
        if (nanoStatus.available && nanoStatus.isReady !== false) {
          console.log('[Background] Web Tab failed, falling back to Gemini Nano.');
          const reply = await generateViaNano(promptText, customInstructions, mode, maxLength);
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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target === 'offscreen') return false;

  (async () => {
    try {
      if (message.type === 'CHECK_ENGINE_STATUS') {
        let { engine = 'cloud_api', apiKey = '', cloudModel = 'gemini-3.5-flash-lite' } = await chrome.storage.local.get(['engine', 'apiKey', 'cloudModel']);

        const normalizedModel = normalizeCloudModel(cloudModel);
        if (normalizedModel !== cloudModel) {
          cloudModel = normalizedModel;
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

        if (engine === 'custom_api') {
          const storedCustom = await chrome.storage.local.get(['customApi']);
          const cfg = { ...DEFAULT_CUSTOM_API, ...(storedCustom?.customApi || {}) };
          const model = String(cfg.model || '').trim();
          const baseUrl = String(cfg.baseUrl || '').trim();
          if (!baseUrl || !model) {
            return sendResponse({
              engine: 'custom_api',
              connected: false,
              statusText: !baseUrl ? 'URL Missing' : 'Model Missing',
              message: 'Configure your Custom API Endpoint URL and Model in extension settings.'
            });
          }
          try {
            const normalized = normalizeCustomApiUrl(baseUrl, cfg.format || 'openai', 'completion');
            const hasKey = String(cfg.apiKey || '').trim().length > 0;
            let hasCustomAuth = false;
            try {
              hasCustomAuth = Object.keys(parseCustomHeaders(cfg.customHeaders)).length > 0;
            } catch (e) {}

            if (!normalized.isLocal && !hasKey && !hasCustomAuth) {
              return sendResponse({
                engine: 'custom_api',
                connected: false,
                statusText: 'Key Missing',
                message: 'API Key required for remote Custom API endpoint. Enter your key in Settings.'
              });
            }

            const hasPerm = await checkCustomApiOriginPermission(normalized.originPattern);
            if (!hasPerm) {
              return sendResponse({
                engine: 'custom_api',
                connected: false,
                statusText: 'Permission Needed',
                message: `Open Settings and click "Verify & Save" to grant access to ${normalized.originPattern}.`
              });
            }
            return sendResponse({
              engine: 'custom_api',
              connected: true,
              statusText: `Ready (${model})`,
              message: `Connected to Custom API (${model}). 0 tabs needed!`,
              model
            });
          } catch (urlErr) {
            return sendResponse({
              engine: 'custom_api',
              connected: false,
              statusText: 'Invalid URL',
              message: urlErr.message
            });
          }
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

      if (message.type === 'VALIDATE_CUSTOM_API') {
        const validation = await validateCustomAPIConfig(message.payload || {});
        return sendResponse(validation);
      }

      if (message.type === 'FETCH_CUSTOM_API_MODELS') {
        try {
          const models = await fetchCustomAPIModels(message.payload || {});
          return sendResponse({ success: true, models });
        } catch (err) {
          return sendResponse({ success: false, message: err.message });
        }
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
        const settings = await chrome.storage.local.get(['engine', 'customInstructions', 'maxReplyLength']);
        const engine = message.payload?.engineOverride || settings.engine || 'cloud_api';
        const disableFallback = !!message.payload?.disableFallback;
        const customInstructions = settings.customInstructions || message.payload?.customInstructions || '';
        const maxReplyLength = resolveEffectiveMaxLength(
          message.payload?.maxLength ?? settings.maxReplyLength,
          customInstructions,
          280
        );
        const promptText = buildGeminiPrompt({
          ...message.payload,
          customInstructions,
          maxLength: maxReplyLength
        });

        const result = await executeWithFallback(engine, promptText, customInstructions, 'reply', disableFallback, maxReplyLength);

        return sendResponse({
          success: true,
          reply: cleanGeneratedReply(result.reply, customInstructions, 'reply', maxReplyLength),
          engine: result.engine
        });
      }

      if (message.type === 'GENERATE_POST') {
        const settings = await chrome.storage.local.get(['engine', 'customInstructions', 'maxPostLength']);
        const engine = message.payload?.engineOverride || settings.engine || 'cloud_api';
        const disableFallback = !!message.payload?.disableFallback;
        const customInstructions = settings.customInstructions || message.payload?.customInstructions || '';
        const maxPostLength = resolveEffectiveMaxLength(
          message.payload?.maxLength ?? settings.maxPostLength,
          customInstructions,
          280
        );
        const promptText = buildGeminiPostPrompt({
          ...message.payload,
          customInstructions,
          maxLength: maxPostLength
        });

        const result = await executeWithFallback(engine, promptText, customInstructions, 'post', disableFallback, maxPostLength);

        return sendResponse({
          success: true,
          post: cleanGeneratedPost(result.reply, customInstructions, maxPostLength),
          engine: result.engine
        });
      }

      sendResponse({ success: false, error: 'UNKNOWN_TYPE' });
    } catch (globalError) {
      const errMsg = globalError.message || '';
      let errCode = 'INTERNAL_ERROR';
      if (/not logged in|session token|log in|ServiceLogin/i.test(errMsg)) {
        errCode = 'NOT_LOGGED_IN';
      } else if (/no tab|tab is not open|not responding/i.test(errMsg)) {
        errCode = 'NO_TAB';
      } else if (/host permission not granted|permission required/i.test(errMsg)) {
        errCode = 'PERMISSION_ERROR';
      } else if (/custom api/i.test(errMsg)) {
        errCode = 'CUSTOM_API_ERROR';
      } else if (/api key/i.test(errMsg)) {
        errCode = 'API_KEY_ERROR';
      }

      if (errCode === 'INTERNAL_ERROR') {
        console.error('[Background] Error:', globalError);
      } else {
        console.warn(`[Background] Handled ${errCode}: ${errMsg}`);
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
