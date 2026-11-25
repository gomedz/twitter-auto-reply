// constants.js - Shared Configuration, Selectors, Theme Sync, Toast & Runtime Helpers

console.log('[Twitter-AI-Reply] Content script loaded on Twitter/X.');

// Tone choices configuration
const TONES = [
  { id: 'quick', label: 'Quick Reply', icon: '⚡' },
  { id: 'agree', label: 'Agree & Support', icon: '👍' },
  { id: 'thoughtful', label: 'Thoughtful Insight', icon: '💡' },
  { id: 'funny', label: 'Witty & Funny', icon: '😂' },
  { id: 'question', label: 'Ask a Question', icon: '❓' },
  { id: 'debate', label: 'Counter-Point', icon: '🔥' }
];

// Post style choices configuration (for standalone tweets)
const POST_STYLES = [
  { id: 'engaging', label: 'Engaging Hook', icon: '🚀', desc: 'Punchy opening hook' },
  { id: 'insight', label: 'Insight & Value', icon: '💡', desc: 'Actionable tips & thoughts' },
  { id: 'announcement', label: 'Announcement', icon: '📣', desc: 'Exciting news or launch' },
  { id: 'hottake', label: 'Bold Hot Take', icon: '🔥', desc: 'Contrarian perspective' },
  { id: 'witty', label: 'Witty & Relatable', icon: '😂', desc: 'Casual internet humor' },
  { id: 'question', label: 'Discussion Starter', icon: '❓', desc: 'Open question for replies' },
  { id: 'thread', label: 'Thread Opener', icon: '🧵', desc: 'Hook introducing a thread' }
];

// Resilient multi-layer selector definitions (supporting modern Base UI + Tailwind and legacy React DOM)
const SELECTORS = {
  tweetArticle: 'article[data-testid="tweet"], article.group\\/post, article[role="article"], article',
  tweetText: 'div[data-testid="tweetText"], [data-testid="tweetText"], div[dir="auto"][class*="whitespace-pre-wrap"], div[dir="auto"]',
  userName: 'div[data-testid="User-Name"], [data-testid="User-Name"]',
  toolbar: 'div[data-testid="toolBar"], [role="toolbar"], div[class*="toolbar"]',
  tweetButton: '[data-testid="tweetButtonInline"], [data-testid="tweetButton"], button[data-testid*="tweetButton"]',
  editor: 'div[data-testid^="tweetTextarea_"][role="textbox"], div[role="textbox"][contenteditable="true"], div[contenteditable="true"][role="textbox"], div[contenteditable="true"]',
  composeNavBtn: 'a[data-testid="SideNav_NewTweet_Button"], div[data-testid="SideNav_NewTweet_Button"], a[href="/compose/post"], a[href="/compose/tweet"]'
};

// Priority-ordered selector helpers (avoids CSS comma DOM-order shadowing)
function splitSelectorGroup(selectorGroup) {
  return String(selectorGroup || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

function queryFirst(root, selectorGroup) {
  if (!root || typeof root.querySelector !== 'function') return null;
  for (const sel of splitSelectorGroup(selectorGroup)) {
    try {
      const match = root.querySelector(sel);
      if (match) return match;
    } catch (e) {}
  }
  return null;
}

function queryAllFirst(root, selectorGroup) {
  if (!root || typeof root.querySelectorAll !== 'function') return [];
  for (const sel of splitSelectorGroup(selectorGroup)) {
    try {
      const matches = root.querySelectorAll(sel);
      if (matches && matches.length > 0) return Array.from(matches);
    } catch (e) {}
  }
  return [];
}

function closestFirst(el, selectorGroup) {
  if (!el || typeof el.closest !== 'function') return null;
  for (const sel of splitSelectorGroup(selectorGroup)) {
    try {
      const match = el.closest(sel);
      if (match) return match;
    } catch (e) {}
  }
  return null;
}

// Safe runtime messaging with extension reload / context invalidation detection
function sendRuntimeMessage(message) {
  return new Promise((resolve, reject) => {
    try {
      if (!chrome?.runtime?.id) {
        return reject(new Error('Extension updated — please refresh this X.com tab.'));
      }
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          const msg = chrome.runtime.lastError.message || 'Communication error';
          if (/context invalidated|receiving end does not exist/i.test(msg)) {
            return reject(new Error('Extension updated — please refresh this X.com tab.'));
          }
          return reject(new Error(msg));
        }
        resolve(response);
      });
    } catch (err) {
      if (/context invalidated/i.test(err?.message || '')) {
        reject(new Error('Extension updated — please refresh this X.com tab.'));
      } else {
        reject(err);
      }
    }
  });
}

// Detect X.com actual computed background theme (Lights Out / Dim vs Light)
function syncPageThemeClass() {
  try {
    if (!document.documentElement || !document.body) return;
    const bg = window.getComputedStyle(document.body).backgroundColor || '';
    const rgbMatch = bg.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?/i);
    let isLight = false;
    if (rgbMatch) {
      const alpha = rgbMatch[4] !== undefined ? parseFloat(rgbMatch[4]) : 1;
      if (alpha > 0.1) {
        const r = parseInt(rgbMatch[1], 10);
        const g = parseInt(rgbMatch[2], 10);
        const b = parseInt(rgbMatch[3], 10);
        const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
        isLight = luminance > 128;
      }
    }
    document.documentElement.classList.toggle('gemini-x-light', isLight);
  } catch (e) {}
}

// Single global click listener to close open tone/style menus (prevents detached DOM memory leaks)
document.addEventListener('click', (e) => {
  const clickedWrapper = e.target.closest?.('.gemini-reply-wrapper');
  document.querySelectorAll('.gemini-reply-wrapper').forEach(w => {
    if (w !== clickedWrapper) {
      const menu = w.querySelector('.gemini-tone-menu');
      const arrow = w.querySelector('.gemini-arrow-icon');
      if (menu) menu.style.display = 'none';
      if (arrow) arrow.classList.remove('open');
    }
  });
});

// Show floating toast notification on Twitter
function showToast(message, type = 'info', actionBtn = null) {
  const existingToast = document.querySelector('.gemini-toast');
  if (existingToast) existingToast.remove();

  const toast = document.createElement('div');
  toast.className = `gemini-toast ${type}`;

  const textSpan = document.createElement('span');
  textSpan.textContent = message;
  toast.appendChild(textSpan);

  if (actionBtn) {
    const btn = document.createElement('button');
    btn.className = 'gemini-toast-btn';
    btn.textContent = actionBtn.text;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      actionBtn.onClick();
      toast.remove();
    });
    toast.appendChild(btn);
  }

  document.body.appendChild(toast);

  setTimeout(() => {
    if (toast.parentElement) {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }
  }, 5000);
}

// Resolve human-readable label for the currently selected engine
async function getActiveEngineDisplayInfo() {
  try {
    const s = await chrome.storage.local.get(['engine', 'cloudModel', 'customApi']);
    const engine = s?.engine || 'cloud_api';
    if (engine === 'nano') {
      return { toastLabel: 'Gemini Nano', btnLabel: 'Nano...' };
    }
    if (engine === 'cloud_api') {
      const model = (s?.cloudModel || '').trim();
      return {
        toastLabel: model ? `Cloud API (${model})` : 'Gemini Cloud API',
        btnLabel: 'Cloud API...'
      };
    }
    if (engine === 'custom_api') {
      const model = (s?.customApi?.model || '').trim();
      return {
        toastLabel: model ? `Custom API (${model})` : 'Custom API',
        btnLabel: 'Custom API...'
      };
    }
    if (engine === 'headless') {
      return { toastLabel: 'Headless Web', btnLabel: 'Headless...' };
    }
    return { toastLabel: 'Gemini Web Tab', btnLabel: 'Web Tab...' };
  } catch (e) {
    return { toastLabel: 'AI', btnLabel: 'AI...' };
  }
}

function showGenerationErrorToast(response, engineToastLabel, fallbackMsg) {
  const errorMsg = response?.message || fallbackMsg || 'Generation failed.';
  const isAuthIssue = response?.error === 'NOT_LOGGED_IN' ||
                      response?.error === 'NO_TAB' ||
                      /not logged in|session token|log in|no gemini tab/i.test(errorMsg);
  const isApiKeyIssue = response?.error === 'API_KEY_ERROR' ||
                        (response?.error !== 'CUSTOM_API_ERROR' && /api key|api_key/i.test(errorMsg));

  if (isAuthIssue) {
    showToast('Please log in to Gemini at gemini.google.com', 'error', {
      text: 'Open Gemini',
      onClick: () => sendRuntimeMessage({ type: 'OPEN_GEMINI' }).catch(() => {})
    });
  } else if (isApiKeyIssue) {
    showToast('Gemini API key missing or invalid. Check extension settings.', 'error');
  } else if (response?.error === 'PERMISSION_ERROR' || response?.error === 'CUSTOM_API_ERROR') {
    showToast(errorMsg, 'error');
  } else {
    showToast(`${engineToastLabel} error: ${errorMsg}`, 'error');
  }
}
