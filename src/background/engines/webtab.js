// webtab.js - Gemini Web Tab Automation Engine

import { GEMINI_URL } from '../config.js';

export async function findGeminiTab() {
  const tabs = await chrome.tabs.query({ url: 'https://gemini.google.com/*' });
  if (!tabs || tabs.length === 0) return null;
  const appTab = tabs.find(t => t.url && t.url.includes('/app'));
  return appTab || tabs[0];
}

export async function waitForGeminiTabReady(tabId, timeoutMs = 25000) {
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

export async function openGeminiTab(inBackground = false) {
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

export function sendMessageOnce(tabId, message, timeoutMs) {
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

export async function sendToGeminiTab(tabId, message, timeoutMs = 30000) {
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
          files: ['src/content/gemini/gemini.js']
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

export async function generateViaWebTab(promptText) {
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
