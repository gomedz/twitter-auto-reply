// content_gemini.js - Gemini Web Automation Script (Runs on gemini.google.com)

console.log('[Twitter-AI-Reply] Gemini Content Script loaded on', window.location.href);

// Selectors for Gemini's input field
const INPUT_SELECTORS = [
  'rich-textarea .ql-editor',
  'rich-textarea div[contenteditable="true"]',
  'div.ql-editor[contenteditable="true"]',
  'div[contenteditable="true"][role="textbox"]',
  'div[contenteditable="true"][data-placeholder]',
  'div[contenteditable="true"]',
  'textarea[aria-label*="prompt" i]',
  'textarea'
];

// Selectors for Gemini's send button
const SEND_BUTTON_SELECTORS = [
  'button[aria-label*="Send message" i]',
  'button[aria-label*="Send prompt" i]',
  'button[aria-label*="Send" i]',
  '.send-button-container button',
  'button.send-button',
  'button[mattooltip*="Send" i]',
  'button[data-test-id="send-button"]'
];

// Selectors for stop generation button (visible while streaming)
const STOP_BUTTON_SELECTORS = [
  'button[aria-label*="Stop response" i]',
  'button[aria-label*="Stop generating" i]',
  'button[aria-label*="Stop streaming" i]',
  'button[aria-label*="Stop" i]',
  '.stop-button',
  'button[mattooltip*="Stop" i]',
  '[data-test-id="stop-button"]'
];

// Selectors for response containers
const RESPONSE_SELECTORS = [
  'message-content .model-response-text',
  'message-content',
  '.model-response-text',
  '.response-content',
  'model-response',
  'div.markdown',
  '.presented-response'
];

// Find input element (including inside rich-textarea shadow root if needed)
function findInputElement() {
  for (const s of INPUT_SELECTORS) {
    try {
      const el = document.querySelector(s);
      if (el) return el;
    } catch (e) {}
  }

  const richTextarea = document.querySelector('rich-textarea');
  if (richTextarea) {
    if (richTextarea.shadowRoot) {
      for (const s of INPUT_SELECTORS) {
        try {
          const el = richTextarea.shadowRoot.querySelector(s);
          if (el) return el;
        } catch (e) {}
      }
    }
    const editable = richTextarea.querySelector('[contenteditable="true"]');
    if (editable) return editable;
  }

  return null;
}

// Find first matching element from a list of selectors
function findElement(selectors, parent = document) {
  for (const selector of selectors) {
    try {
      const el = parent.querySelector(selector);
      if (el) return el;
    } catch (e) {}
  }
  return null;
}

// Find all matching elements
function findElements(selectors, parent = document) {
  for (const selector of selectors) {
    try {
      const els = parent.querySelectorAll(selector);
      if (els && els.length > 0) return Array.from(els);
    } catch (e) {}
  }
  return [];
}

// Escape html for fallback insertion
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Check if user is logged in
function checkLoginStatus() {
  const url = window.location.href;
  const isApp = url.includes('/app');
  const inputEl = findInputElement();
  const richTextarea = document.querySelector('rich-textarea');
  const chatWindow = document.querySelector('chat-window, bard-sidenav, chat-history, [aria-label*="Chat history" i], [aria-label*="Recent chats" i]');
  const newChatBtn = document.querySelector('button[aria-label*="New chat" i], [data-test-id*="new-chat"]');

  const hasChatUI = !!(inputEl || richTextarea || chatWindow || newChatBtn);
  const explicitSignIn = document.querySelector('a[href*="ServiceLogin"], a[href*="/signin"], button[aria-label*="Sign in" i]');
  const isLoggedIn = hasChatUI || (isApp && !explicitSignIn);

  return {
    loggedIn: isLoggedIn,
    hasInput: !!inputEl || !!richTextarea,
    hasChatUI: hasChatUI,
    url: url,
    isApp: isApp
  };
}

// Wait for input element to be available
async function waitForInput(timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const input = findInputElement();
    if (input) return input;
    await new Promise(r => setTimeout(r, 250));
  }
  return null;
}

// Set text in Gemini input box
async function setGeminiInput(text) {
  const input = await waitForInput(15000);
  if (!input) {
    throw new Error('Gemini input box not found. Please ensure you are on gemini.google.com/app and logged in.');
  }

  input.focus();

  const p = input.querySelector('p') || input;
  p.focus();

  let success = false;
  try {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(input);
    selection.removeAllRanges();
    selection.addRange(range);
    success = document.execCommand('insertText', false, text);
  } catch (e) {}

  if (!success || !input.innerText.trim()) {
    if (input.tagName === 'TEXTAREA') {
      input.value = text;
    } else {
      input.innerHTML = `<p>${escapeHtml(text)}</p>`;
    }

    input.dispatchEvent(new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertText',
      data: text
    }));
    input.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertText',
      data: text
    }));
  }

  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));

  await new Promise(r => setTimeout(r, 400));
}

// Click send button or press enter
async function clickSend() {
  const start = Date.now();
  while (Date.now() - start < 3000) {
    const sendBtn = findElement(SEND_BUTTON_SELECTORS);
    if (sendBtn && !sendBtn.disabled && sendBtn.getAttribute('aria-disabled') !== 'true') {
      sendBtn.click();
      return true;
    }
    await new Promise(r => setTimeout(r, 200));
  }

  const sendBtn = findElement(SEND_BUTTON_SELECTORS);
  if (sendBtn) {
    sendBtn.disabled = false;
    sendBtn.removeAttribute('disabled');
    sendBtn.setAttribute('aria-disabled', 'false');
    sendBtn.click();
    return true;
  }

  const input = findInputElement();
  if (input) {
    input.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true
    }));
    return true;
  }

  throw new Error('Could not find or click the Send button in Gemini.');
}

// Wait for the NEW response node to mount and finish streaming
async function waitForGeminiResponse(initialResponseCount, timeoutMs = 45000) {
  const startTime = Date.now();
  let sawStopBtn = false;
  let lastText = '';
  let stableCount = 0;

  return new Promise((resolve, reject) => {
    const checkInterval = setInterval(() => {
      if (Date.now() - startTime > timeoutMs) {
        clearInterval(checkInterval);
        const responses = findElements(RESPONSE_SELECTORS);
        if (responses.length > initialResponseCount) {
          const lastResp = responses[responses.length - 1];
          const text = lastResp.innerText || lastResp.textContent || '';
          if (text.trim()) return resolve(text.trim());
        }
        return reject(new Error('Timeout waiting for Gemini response.'));
      }

      const stopBtn = findElement(STOP_BUTTON_SELECTORS);
      const responses = findElements(RESPONSE_SELECTORS);
      const currentCount = responses.length;

      if (stopBtn) {
        sawStopBtn = true;
      }

      // Strictly require a new response container beyond initialResponseCount
      if (currentCount > initialResponseCount) {
        const lastResp = responses[currentCount - 1];
        const currentText = lastResp ? (lastResp.innerText || lastResp.textContent || '').trim() : '';

        if (currentText && currentText === lastText) {
          stableCount++;
        } else {
          stableCount = 0;
          lastText = currentText;
        }

        const requiredStableChecks = sawStopBtn ? 2 : 4;

        if (!stopBtn && stableCount >= requiredStableChecks && currentText.length > 0) {
          clearInterval(checkInterval);
          setTimeout(() => resolve(currentText), 150);
        }
      }
    }, 250);
  });
}

// Main execution function
async function handleExecutePrompt(prompt) {
  const status = checkLoginStatus();
  if (!status.loggedIn) {
    return {
      error: 'NOT_LOGGED_IN',
      message: 'You are not logged into Google Gemini. Please open gemini.google.com/app and log in with your Google account.'
    };
  }

  const initialResponses = findElements(RESPONSE_SELECTORS);
  const initialCount = initialResponses.length;

  await setGeminiInput(prompt);
  await clickSend();

  const replyText = await waitForGeminiResponse(initialCount, 45000);

  if (!replyText || !replyText.trim()) {
    return {
      error: 'EMPTY_TEXT',
      message: 'Gemini generated an empty response.'
    };
  }

  return {
    success: true,
    reply: replyText.trim()
  };
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CHECK_AUTH_STATUS') {
    const status = checkLoginStatus();
    console.log('[Twitter-AI-Reply] Status checked:', status);
    sendResponse(status);
    return false;
  }

  if (message.type === 'EXECUTE_PROMPT') {
    (async () => {
      try {
        const result = await handleExecutePrompt(message.prompt);
        sendResponse(result);
      } catch (err) {
        console.error('[Twitter-AI-Reply] Gemini execution error:', err);
        sendResponse({
          error: 'EXECUTION_EXCEPTION',
          message: err.message || 'Unknown error occurred while interacting with Gemini.'
        });
      }
    })();
    return true;
  }
});