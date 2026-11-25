// content_twitter.js - Injects AI Reply button below Twitter (X) reply boxes

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

// Extract primary tweet text from an article element without capturing handles/timestamps/quoted chrome
function extractTweetTextFromArticle(tweetEl) {
  if (!tweetEl) return '';

  const specificSelectors = [
    'div[data-testid="tweetText"]',
    '[data-testid="tweetText"]',
    'div[dir="auto"][class*="whitespace-pre-wrap"]'
  ];

  for (const sel of specificSelectors) {
    try {
      const candidates = Array.from(tweetEl.querySelectorAll(sel));
      const direct = candidates.find(el => {
        const closestArt = el.closest('article');
        return !closestArt || closestArt === tweetEl;
      });
      if (direct && (direct.innerText || direct.textContent || '').trim()) {
        return (direct.innerText || direct.textContent || '').trim();
      }
    } catch (e) {}
  }

  // Fallback to dir="auto" excluding author metadata, timestamps, handles, and nested quoted tweets
  try {
    const dirAutos = Array.from(tweetEl.querySelectorAll('div[dir="auto"]')).filter(el => {
      const closestArt = el.closest('article');
      if (closestArt && closestArt !== tweetEl) return false;
      if (el.closest('[data-testid="User-Name"], time')) return false;
      const txt = (el.innerText || el.textContent || '').trim();
      if (!txt) return false;
      if (/^@[A-Za-z0-9_]+$/.test(txt)) return false;
      if (/^(?:Pinned|Reposted|Retweeted|Replying to|Show more|Translate post)$/i.test(txt)) return false;
      if (el.closest('a[href^="/"]') && txt.length < 35 && !/\s/.test(txt)) return false;
      return true;
    });
    if (dirAutos.length > 0) {
      // Pick the longest meaningful text block if multiple dir="auto" exist
      dirAutos.sort((a, b) => (b.innerText || b.textContent || '').length - (a.innerText || a.textContent || '').length);
      return (dirAutos[0].innerText || dirAutos[0].textContent || '').trim();
    }
  } catch (e) {}

  return '';
}

// Find tweet text and author for context
function extractTweetContext(composerEl) {
  // Helper to extract text and author from any tweet article element
  const parseArticle = (tweetEl) => {
    if (!tweetEl) return null;
    const text = extractTweetTextFromArticle(tweetEl);
    const author = extractAuthorHandle(tweetEl);
    return (text || author) ? { text, author } : null;
  };

  // 1. Check if inside a modal dialog (Reply modal: article precedes editor; Quote modal: article follows editor)
  const modal = composerEl.closest('div[role="dialog"]');
  if (modal) {
    const tweetEls = queryAllFirst(modal, SELECTORS.tweetArticle);
    if (tweetEls.length > 0) {
      const editor = findAssociatedEditor(composerEl);
      if (editor && typeof editor.compareDocumentPosition === 'function') {
        const precedingTweets = tweetEls.filter(t => (editor.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_PRECEDING) !== 0);
        if (precedingTweets.length > 0) {
          const parsed = parseArticle(precedingTweets[precedingTweets.length - 1]);
          if (parsed) return parsed;
        }
        const followingTweets = tweetEls.filter(t => (editor.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0);
        if (followingTweets.length > 0) {
          const parsed = parseArticle(followingTweets[0]);
          if (parsed) return { ...parsed, isQuote: true };
        }
      }
      const parsed = parseArticle(tweetEls[tweetEls.length - 1]);
      if (parsed) return parsed;
    }
  }

  // 2. If inline reply directly inside a tweet article
  const closestTweet = closestFirst(composerEl, SELECTORS.tweetArticle);
  if (closestTweet) {
    const parsed = parseArticle(closestTweet);
    if (parsed) return parsed;
  }

  // 3. Walk up to 4 container levels above an inline reply box to find the immediately preceding tweet article
  let current = composerEl;
  let depth = 0;
  while (current && current !== document.body && depth < 4) {
    let prev = current.previousElementSibling;
    while (prev) {
      const isArticle = splitSelectorGroup(SELECTORS.tweetArticle).some(sel => {
        try { return prev.matches?.(sel); } catch (e) { return false; }
      });
      const tweetMatches = isArticle ? [prev] : queryAllFirst(prev, SELECTORS.tweetArticle);
      if (tweetMatches.length > 0) {
        const parsed = parseArticle(tweetMatches[tweetMatches.length - 1]);
        if (parsed && parsed.text) {
          return parsed;
        }
      }
      prev = prev.previousElementSibling;
    }
    current = current.parentElement;
    depth++;
  }

  // 4. Fallback to the focal/main tweet on an individual tweet status page
  if (window.location.pathname.includes('/status/')) {
    const mainTweet = document.querySelector('article[tabindex="-1"]') || queryFirst(document, SELECTORS.tweetArticle);
    if (mainTweet) {
      const parsed = parseArticle(mainTweet);
      if (parsed) return parsed;
    }
  }

  return { text: '', author: '' };
}

// Extract handle from author container or tweet article element
function extractAuthorHandle(containerEl) {
  if (!containerEl) return '';

  // 1. Check explicit User-Name selector first if available
  const userNameEl = queryFirst(containerEl, SELECTORS.userName) ||
    (splitSelectorGroup(SELECTORS.userName).some(sel => { try { return containerEl.matches?.(sel); } catch (e) { return false; } }) ? containerEl : null);
  const textSource = userNameEl ? (userNameEl.innerText || '') : (containerEl.innerText || '');
  const match = textSource.match(/@([A-Za-z0-9_]+)/);
  if (match) return match[1];

  // 2. Search links or spans inside container for @handle
  if (typeof containerEl.querySelectorAll === 'function') {
    const handleEl = Array.from(containerEl.querySelectorAll('a[href^="/"], span')).find(el => {
      const txt = (el.innerText || '').trim();
      return txt.startsWith('@') && /^@[A-Za-z0-9_]+$/.test(txt);
    });
    if (handleEl) {
      return handleEl.innerText.trim().replace(/^@/, '');
    }

    // 3. Fallback: Parse root user profile link (e.g. href="/Google")
    const userLink = containerEl.querySelector('a[href^="/"][data-status="active"], a[href^="/"][role="link"], a[href^="/"]');
    if (userLink) {
      const href = userLink.getAttribute('href') || '';
      const linkMatch = href.match(/^\/([A-Za-z0-9_]+)$/);
      if (linkMatch && !['home', 'explore', 'notifications', 'messages', 'i', 'compose'].includes(linkMatch[1].toLowerCase())) {
        return linkMatch[1];
      }
    }
  }

  return '';
}

// Locate the DraftJS or Lexical contenteditable editor associated with this composer
function findAssociatedEditor(composerEl) {
  const modal = composerEl.closest('div[role="dialog"]');
  if (modal) {
    const editor = queryFirst(modal, SELECTORS.editor);
    if (editor) return editor;
  }

  let parent = composerEl.parentElement;
  let levels = 0;
  while (parent && parent !== document.body && levels < 8) {
    const editor = queryFirst(parent, SELECTORS.editor);
    if (editor) return editor;
    parent = parent.parentElement;
    levels++;
  }

  return queryFirst(document, SELECTORS.editor);
}

// Client-side failsafe sanitizer to ensure zero artifacts and no leading emojis before insertion
function sanitizeForEditor(rawText) {
  if (!rawText) return '';
  let cleaned = rawText.trim();
  // Strip invisible control characters, zero-width spaces, BOM
  cleaned = cleaned.replace(/[\u200B-\u200F\uFEFF\u2060\u00AD]/g, '').trim();

  // Strip Google Elicitation / prompt suggestions blocks
  if (/<ElicitationsGroup\b[\s\S]*?<\/ElicitationsGroup>/i.test(cleaned)) {
    const beforeBlock = cleaned.split(/<ElicitationsGroup/i)[0].trim();
    if (beforeBlock.replace(/^[\p{Extended_Pictographic}\s]+/u, '').length >= 10) {
      cleaned = beforeBlock;
    }
  }
  cleaned = cleaned.replace(/<ElicitationsGroup\b[\s\S]*?<\/ElicitationsGroup>/gi, ' ');
  cleaned = cleaned.replace(/<ElicitationsGroup\b(?:\s+message="[^"\n]{1,40}(?:\.{2,3}|…|"))?>?/gi, ' ');
  cleaned = cleaned.replace(/<\/?Elicitation(?:sGroup)?[^>]*>/gi, ' ');
  cleaned = cleaned.replace(/<Elicitation\b[^>]*>/gi, ' ');
  cleaned = cleaned.replace(/<\/?(?:thought|think|scratchpad|annotation|search-result|p|div|span|br|a|b|i|em|strong|code|pre|ul|ol|li|blockquote|h[1-6])(?:\s+[a-zA-Z_:][a-zA-Z0-9_.:-]*\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))*\s*\/?>/gi, ' ');

  // Strip googleusercontent links
  cleaned = cleaned.replace(/https?:\/\/(?:[a-zA-Z0-9-]+\.)*googleusercontent(?:\.(?:com|org|net)(?:\/[^\s]*)?|\.(?=[A-Z\s]|$)|(?=[\s]|$))/gi, '');

  // Strip consecutive duplicated phrases
  cleaned = cleaned.replace(/\b(.{10,120}?)\s+\1\b/gi, '$1');

  // Strip leading emojis (only strip trailing separator punctuation if a leading emoji was actually removed)
  const emojiPrefix = /^(?:[\p{Extended_Pictographic}\uFE0E\uFE0F\u200D\u20E3]|\uD83C[\uDDE6-\uDDFF]|\uD83C[\uDFFB-\uDFFF])+/u;
  let loops = 0;
  while (loops < 10 && emojiPrefix.test(cleaned)) {
    const prev = cleaned;
    cleaned = cleaned.replace(emojiPrefix, '').trim();
    cleaned = cleaned.replace(/^[:\-–—|,!.\s]+/, '').trim();
    if (cleaned === prev) break;
    loops++;
  }

  return cleaned.replace(/[ \t]{2,}/g, ' ').trim();
}

// Insert reply or post text into Twitter's Draft.js / Lexical editor cleanly (Async to allow React state sync)
async function insertTextIntoEditor(editor, rawText) {
  if (!editor || !rawText) return false;
  const text = sanitizeForEditor(rawText);
  if (!text) return false;

  const currentContent = (editor.innerText || editor.textContent || '').trim();
  if (currentContent === text.trim()) return true;

  editor.focus();

  // Step 1: Select all existing content and allow Draft.js/Lexical to sync internal SelectionState
  if (currentContent.length > 0) {
    try {
      const sel = window.getSelection();
      if (sel) {
        const range = document.createRange();
        range.selectNodeContents(editor);
        sel.removeAllRanges();
        sel.addRange(range);
        document.dispatchEvent(new Event('selectionchange'));
      }
      document.execCommand('selectAll', false, null);
    } catch (e) {}

    await new Promise(r => setTimeout(r, 20));

    try {
      editor.dispatchEvent(new InputEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        inputType: 'deleteContentBackward'
      }));
      editor.dispatchEvent(new InputEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        inputType: 'deleteByCut'
      }));
      document.execCommand('delete', false, null);
    } catch (e) {}

    await new Promise(r => setTimeout(r, 20));
  }

  // Step 2: Dispatch beforeinput with insertText for modern Lexical / Draft.js editors
  try {
    editor.dispatchEvent(new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertText',
      data: text
    }));
  } catch (e) {}

  // Step 3: Dispatch synthetic paste event for Draft.js editOnPaste handler
  try {
    const dt = new DataTransfer();
    dt.setData('text/plain', text);
    editor.dispatchEvent(new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData: dt
    }));
  } catch (e) {}

  // Allow React 18 / Lexical to flush DOM updates before verifying insertion
  await new Promise(r => setTimeout(r, 30));

  let updatedContent = (editor.innerText || editor.textContent || '').trim();
  const textSample = text.trim().substring(0, Math.min(20, text.trim().length));

  if (!updatedContent || !updatedContent.includes(textSample)) {
    try {
      document.execCommand('insertText', false, text);
    } catch (e) {}
    await new Promise(r => setTimeout(r, 25));
    updatedContent = (editor.innerText || editor.textContent || '').trim();
  }

  // Step 4: Dispatch input and change events so Twitter's React state and character counter reconcile
  editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
  editor.dispatchEvent(new Event('input', { bubbles: true }));
  editor.dispatchEvent(new Event('change', { bubbles: true }));

  // Step 5: Place cursor cleanly at the end
  setTimeout(() => {
    try {
      editor.focus();
      const sel = window.getSelection();
      if (sel) {
        const range = document.createRange();
        range.selectNodeContents(editor);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
        document.dispatchEvent(new Event('selectionchange'));
      }
    } catch (e) {}
  }, 40);

  return !!updatedContent && (updatedContent === text.trim() || updatedContent.includes(textSample));
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

// Handle generating reply for a selected tone
async function triggerAutoReply(containerEl, actionBtnEl, toneId, composerEl) {
  if (!containerEl || containerEl.dataset.busy === 'true' || containerEl.classList.contains('loading')) return;
  containerEl.dataset.busy = 'true';

  const context = extractTweetContext(composerEl);

  if (!context.text) {
    delete containerEl.dataset.busy;
    showToast('Could not find a tweet to reply to. Open a tweet or thread to use AI Reply.', 'info');
    return;
  }

  const editor = findAssociatedEditor(composerEl);
  if (!editor) {
    delete containerEl.dataset.busy;
    showToast('Could not find the reply input area.', 'error');
    return;
  }

  const engineInfo = await getActiveEngineDisplayInfo();
  const originalHtml = actionBtnEl.innerHTML;
  containerEl.classList.add('loading');
  actionBtnEl.innerHTML = `<span class="gemini-spinner"></span> <span>✦ ${engineInfo.btnLabel}</span>`;

  const startTime = Date.now();
  showToast(`✦ Generating reply with ${engineInfo.toastLabel}...`, 'info');

  try {
    const response = await sendRuntimeMessage({
      type: 'GENERATE_REPLY',
      payload: {
        tweetText: context.text,
        tweetAuthor: context.author,
        tone: toneId
      }
    });

    if (!response || !response.success) {
      showGenerationErrorToast(response, engineInfo.toastLabel, 'Failed to generate reply.');
      return;
    }

    const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
    const engineLabel = response?.engine ? ` via ${response.engine}` : '';
    const replyText = response.reply;
    const inserted = await insertTextIntoEditor(editor, replyText);

    if (inserted) {
      showToast(`✦ Reply generated${engineLabel} in ${durationSec}s!`, 'success');
    } else {
      showToast(`✦ Reply generated${engineLabel} in ${durationSec}s (copied to clipboard)!`, 'info');
      try {
        await navigator.clipboard.writeText(replyText);
      } catch (e) {
        console.warn('[Twitter-AI-Reply] Clipboard write failed:', e);
      }
    }
  } catch (err) {
    console.error('[Twitter-AI-Reply] Generation error:', err);
    showToast(`Error: ${err.message || 'Communication failure'}`, 'error');
  } finally {
    delete containerEl.dataset.busy;
    containerEl.classList.remove('loading');
    actionBtnEl.innerHTML = originalHtml;
  }
}

// Determine whether a composer is for replying to a tweet, quoting a tweet, or creating a new post
function detectComposerType(composerEl) {
  const modal = composerEl.closest('div[role="dialog"]');
  if (modal) {
    const tweetEls = queryAllFirst(modal, SELECTORS.tweetArticle);
    if (tweetEls.length === 0) return 'new_post';

    const editor = findAssociatedEditor(composerEl);
    if (editor && typeof editor.compareDocumentPosition === 'function') {
      const hasPrecedingArticle = tweetEls.some(t => (editor.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_PRECEDING) !== 0);
      if (hasPrecedingArticle) return 'reply';
      const hasFollowingArticle = tweetEls.some(t => (editor.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0);
      if (hasFollowingArticle) return 'quote';
    }
    return 'reply';
  }

  if (closestFirst(composerEl, SELECTORS.tweetArticle)) {
    return 'reply';
  }

  if (window.location.pathname.includes('/status/')) {
    return 'reply';
  }

  // Bounded check (max 3 levels) for inline reply containers directly below a tweet article
  let current = composerEl;
  let depth = 0;
  while (current && current !== document.body && depth < 3) {
    let prev = current.previousElementSibling;
    while (prev) {
      const isArticle = splitSelectorGroup(SELECTORS.tweetArticle).some(sel => {
        try { return prev.matches?.(sel); } catch (e) { return false; }
      });
      if (isArticle || queryFirst(prev, SELECTORS.tweetArticle)) {
        return 'reply';
      }
      prev = prev.previousElementSibling;
    }
    current = current.parentElement;
    depth++;
  }

  return 'new_post';
}

// Display floating topic prompt popover for new posts
function showPostPromptPopover(wrapper, composerToolbar, defaultStyle = 'engaging') {
  if (!wrapper) return;

  const existingPopover = document.querySelector('.gemini-post-popover');
  if (existingPopover) {
    existingPopover.remove();
  }

  const isQuote = wrapper.dataset.composerMode === 'quote';

  const popover = document.createElement('div');
  popover.className = 'gemini-post-popover';

  const header = document.createElement('div');
  header.className = 'gemini-popover-header';
  header.innerHTML = `
    <div class="gemini-popover-title">
      <span class="gemini-sparkle-icon">✦</span>
      <span>${isQuote ? 'Create AI Quote' : 'Create AI Post'}</span>
    </div>
  `;

  const closePopover = () => {
    document.removeEventListener('click', handleOutsideClick);
    popover.remove();
  };

  const handleOutsideClick = (e) => {
    if (!popover.contains(e.target) && !wrapper.contains(e.target)) {
      closePopover();
    }
  };

  const btnClose = document.createElement('button');
  btnClose.type = 'button';
  btnClose.className = 'gemini-popover-close';
  btnClose.innerHTML = '&times;';
  btnClose.title = 'Close';
  btnClose.addEventListener('click', (e) => {
    e.stopPropagation();
    closePopover();
  });
  header.appendChild(btnClose);

  const body = document.createElement('div');
  body.className = 'gemini-popover-body';

  const textarea = document.createElement('textarea');
  textarea.className = 'gemini-popover-input';
  textarea.placeholder = isQuote
    ? 'What angle or take should this quote tweet have? (optional nuance)'
    : 'What should this post be about? (e.g. "3 lessons from building in public in 2026")';
  textarea.rows = 2;

  const footer = document.createElement('div');
  footer.className = 'gemini-popover-footer';

  const styleSelect = document.createElement('select');
  styleSelect.className = 'gemini-popover-select';
  POST_STYLES.forEach(style => {
    const opt = document.createElement('option');
    opt.value = style.id;
    opt.textContent = `${style.icon} ${style.label}`;
    if (style.id === defaultStyle) opt.selected = true;
    styleSelect.appendChild(opt);
  });

  const btnSubmit = document.createElement('button');
  btnSubmit.type = 'button';
  btnSubmit.className = 'gemini-popover-submit';
  btnSubmit.innerHTML = `<span>Generate ✦</span>`;

  const handleSubmit = () => {
    const topic = textarea.value.trim();
    if (!topic) {
      textarea.focus();
      showToast('Please enter a topic or thought to generate.', 'info');
      return;
    }
    const chosenStyle = styleSelect.value;
    closePopover();

    const splitBtn = wrapper.querySelector('.gemini-reply-btn');
    const btnMain = wrapper.querySelector('.gemini-reply-action');
    if (splitBtn && (splitBtn.dataset.busy === 'true' || splitBtn.classList.contains('loading'))) return;
    triggerAutoPost(splitBtn, btnMain, chosenStyle, composerToolbar, topic);
  };

  btnSubmit.addEventListener('click', (e) => {
    e.stopPropagation();
    handleSubmit();
  });

  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Escape') {
      closePopover();
    }
  });

  footer.appendChild(styleSelect);
  footer.appendChild(btnSubmit);

  body.appendChild(textarea);
  body.appendChild(footer);

  popover.appendChild(header);
  popover.appendChild(body);

  setTimeout(() => {
    document.addEventListener('click', handleOutsideClick);
  }, 50);

  wrapper.appendChild(popover);
  setTimeout(() => textarea.focus(), 50);
}

// Handle generating a new post or quote tweet (either by polishing draft, quoting, or using a topic)
async function triggerAutoPost(containerEl, actionBtnEl, styleId, composerToolbar, customTopic = null) {
  if (!containerEl || containerEl.dataset.busy === 'true' || containerEl.classList.contains('loading')) return;
  containerEl.dataset.busy = 'true';

  const editor = findAssociatedEditor(composerToolbar);
  if (!editor) {
    delete containerEl.dataset.busy;
    showToast('Could not find the tweet input area.', 'error');
    return;
  }

  const wrapper = composerToolbar.querySelector('.gemini-reply-wrapper') || containerEl.closest('.gemini-reply-wrapper');
  const isQuoteMode = wrapper?.dataset.composerMode === 'quote';
  const currentDraft = (editor.innerText || editor.textContent || '').trim();
  const quoteContext = isQuoteMode ? extractTweetContext(composerToolbar) : { text: '', author: '' };

  if (!isQuoteMode && !customTopic && !currentDraft) {
    delete containerEl.dataset.busy;
    showPostPromptPopover(wrapper, composerToolbar, styleId);
    showToast('Enter a topic or idea in the prompt bar to generate your post.', 'info');
    return;
  }

  if (isQuoteMode && !quoteContext.text && !customTopic && !currentDraft) {
    delete containerEl.dataset.busy;
    showPostPromptPopover(wrapper, composerToolbar, styleId);
    showToast('Could not read quoted tweet. Enter your angle or topic to generate.', 'info');
    return;
  }

  const topicOrDraft = customTopic || currentDraft || quoteContext.text;
  const isDraft = !customTopic && !!currentDraft;

  const engineInfo = await getActiveEngineDisplayInfo();
  const originalHtml = actionBtnEl.innerHTML;
  containerEl.classList.add('loading');
  actionBtnEl.innerHTML = `<span class="gemini-spinner"></span> <span>✦ ${engineInfo.btnLabel}</span>`;

  showToast(
    isQuoteMode
      ? `✦ Generating quote tweet with ${engineInfo.toastLabel}...`
      : (isDraft ? `✦ Polishing tweet draft with ${engineInfo.toastLabel}...` : `✦ Generating post with ${engineInfo.toastLabel}...`),
    'info'
  );

  try {
    const response = await sendRuntimeMessage({
      type: 'GENERATE_POST',
      payload: {
        topicOrDraft: topicOrDraft,
        isDraft: isDraft,
        isQuote: isQuoteMode,
        quotedText: quoteContext.text || '',
        quotedAuthor: quoteContext.author || '',
        style: styleId
      }
    });

    if (!response || !response.success) {
      showGenerationErrorToast(response, engineInfo.toastLabel, 'Failed to generate post.');
      return;
    }

    const postText = response.post;
    const inserted = await insertTextIntoEditor(editor, postText);

    if (inserted) {
      showToast(
        isQuoteMode
          ? '✦ Quote tweet generated and inserted!'
          : (isDraft ? '✦ Tweet polished and updated!' : '✦ New post generated and inserted!'),
        'success'
      );
    } else {
      showToast('Could not auto-fill tweet box. Text copied to clipboard!', 'info');
      try {
        await navigator.clipboard.writeText(postText);
      } catch (e) {
        console.warn('[Twitter-AI] Clipboard write failed:', e);
      }
    }
  } catch (err) {
    console.error('[Twitter-AI] Post generation error:', err);
    showToast(`Error: ${err.message || 'Communication failure'}`, 'error');
  } finally {
    delete containerEl.dataset.busy;
    containerEl.classList.remove('loading');
    actionBtnEl.innerHTML = originalHtml;
  }
}

// Create the Gemini Auto Reply / Post / Quote split-button element
function createGeminiReplyElement(composerToolbar) {
  const composerType = detectComposerType(composerToolbar);
  const isPost = composerType === 'new_post';
  const isQuote = composerType === 'quote';
  const isPostLike = isPost || isQuote;

  const wrapper = document.createElement('div');
  const modeClass = isQuote ? 'mode-quote' : (isPost ? 'mode-post' : 'mode-reply');
  wrapper.className = `gemini-reply-wrapper ${modeClass}`;
  wrapper.dataset.composerMode = composerType;

  const splitBtn = document.createElement('div');
  splitBtn.className = 'gemini-reply-btn';

  const btnMain = document.createElement('button');
  btnMain.type = 'button';
  btnMain.className = 'gemini-reply-action';
  btnMain.title = isQuote
    ? 'AI Quote (Click to generate a quote tweet)'
    : (isPost
      ? 'AI Post (Click to polish draft or enter topic)'
      : 'AI Auto Reply (Click to generate with default tone)');
  btnMain.innerHTML = `
    <span class="gemini-sparkle-icon">✦</span>
    <span>${isQuote ? 'AI Quote' : (isPost ? 'AI Post' : 'AI Reply')}</span>
  `;

  const divider = document.createElement('div');
  divider.className = 'gemini-reply-divider';

  const btnArrow = document.createElement('button');
  btnArrow.type = 'button';
  btnArrow.className = 'gemini-reply-arrow';
  btnArrow.title = isQuote ? 'Choose quote style or enter angle' : (isPost ? 'Choose post style or enter topic' : 'Choose reply tone');
  btnArrow.innerHTML = `<span class="gemini-arrow-icon">▾</span>`;

  splitBtn.appendChild(btnMain);
  splitBtn.appendChild(divider);
  splitBtn.appendChild(btnArrow);

  const menu = document.createElement('div');
  menu.className = 'gemini-tone-menu';
  menu.style.display = 'none';

  const menuHeader = document.createElement('div');
  menuHeader.className = 'gemini-tone-header';
  menuHeader.textContent = isQuote ? 'Quote Style' : (isPost ? 'Post Style' : 'Reply Tone');
  menu.appendChild(menuHeader);

  const arrowSpan = btnArrow.querySelector('.gemini-arrow-icon');

  if (isPostLike) {
    const promptItem = document.createElement('div');
    promptItem.className = 'gemini-tone-item gemini-tone-item-prompt';
    promptItem.innerHTML = `
      <span class="gemini-tone-icon">💡</span>
      <span style="font-weight: 600;">${isQuote ? 'Enter Quote Angle...' : 'Enter Topic / Idea...'}</span>
    `;
    promptItem.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.style.display = 'none';
      arrowSpan.classList.remove('open');
      showPostPromptPopover(wrapper, composerToolbar);
    });
    menu.appendChild(promptItem);

    const menuDivider = document.createElement('div');
    menuDivider.className = 'gemini-tone-divider';
    menu.appendChild(menuDivider);

    POST_STYLES.forEach(style => {
      const item = document.createElement('div');
      item.className = 'gemini-tone-item';
      item.innerHTML = `
        <span class="gemini-tone-icon">${style.icon}</span>
        <span>${style.label}</span>
      `;

      item.addEventListener('click', (e) => {
        e.stopPropagation();
        if (splitBtn.dataset.busy === 'true' || splitBtn.classList.contains('loading')) return;
        menu.style.display = 'none';
        arrowSpan.classList.remove('open');
        triggerAutoPost(splitBtn, btnMain, style.id, composerToolbar);
      });

      menu.appendChild(item);
    });
  } else {
    TONES.forEach(tone => {
      const item = document.createElement('div');
      item.className = 'gemini-tone-item';
      item.innerHTML = `
        <span class="gemini-tone-icon">${tone.icon}</span>
        <span>${tone.label}</span>
      `;

      item.addEventListener('click', (e) => {
        e.stopPropagation();
        if (splitBtn.dataset.busy === 'true' || splitBtn.classList.contains('loading')) return;
        menu.style.display = 'none';
        arrowSpan.classList.remove('open');
        triggerAutoReply(splitBtn, btnMain, tone.id, composerToolbar);
      });

      menu.appendChild(item);
    });
  }

  let resolvingSettings = false;
  btnMain.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (resolvingSettings || splitBtn.dataset.busy === 'true' || splitBtn.classList.contains('loading')) return;
    resolvingSettings = true;

    menu.style.display = 'none';
    arrowSpan.classList.remove('open');

    try {
      if (isPostLike) {
        let preferredStyle = 'engaging';
        try {
          const settings = await chrome.storage.local.get(['defaultPostStyle']);
          if (settings && settings.defaultPostStyle) {
            preferredStyle = settings.defaultPostStyle;
          }
        } catch (err) {}
        resolvingSettings = false;
        triggerAutoPost(splitBtn, btnMain, preferredStyle, composerToolbar);
      } else {
        let preferredTone = 'quick';
        try {
          const settings = await chrome.storage.local.get(['defaultTone']);
          if (settings && settings.defaultTone) {
            preferredTone = settings.defaultTone;
          }
        } catch (err) {}
        resolvingSettings = false;
        triggerAutoReply(splitBtn, btnMain, preferredTone, composerToolbar);
      }
    } finally {
      resolvingSettings = false;
    }
  });

  btnArrow.addEventListener('click', (e) => {
    e.stopPropagation();
    if (splitBtn.classList.contains('loading')) return;

    const isOpen = menu.style.display === 'flex';
    if (isOpen) {
      menu.style.display = 'none';
      arrowSpan.classList.remove('open');
    } else {
      document.querySelectorAll('.gemini-tone-menu').forEach(m => m.style.display = 'none');
      document.querySelectorAll('.gemini-arrow-icon').forEach(a => a.classList.remove('open'));

      menu.style.display = 'flex';
      arrowSpan.classList.add('open');

      const rect = menu.getBoundingClientRect();
      if (rect.right > window.innerWidth - 12) {
        menu.style.right = '0px';
        menu.style.left = 'auto';
      } else if (rect.left < 12) {
        menu.style.left = '0px';
        menu.style.right = 'auto';
      }

      const btnRect = splitBtn.getBoundingClientRect();
      const modal = composerToolbar.closest('div[role="dialog"]');
      const topLimit = modal ? modal.getBoundingClientRect().top + 10 : 12;
      const availableHeight = btnRect.top - topLimit - 8;
      if (availableHeight > 70) {
        menu.style.maxHeight = Math.min(165, Math.floor(availableHeight)) + 'px';
      } else {
        menu.style.maxHeight = '165px';
      }
      menu.scrollTop = 0;
    }
  });

  wrapper.appendChild(splitBtn);
  wrapper.appendChild(menu);

  return wrapper;
}

// Find a flex toolbar row for a submit button when no semantic toolbar was matched
function findToolbarContainerForSubmit(btn) {
  let curr = btn?.parentElement;
  let depth = 0;
  while (curr && curr !== document.body && depth < 5) {
    const cls = typeof curr.className === 'string' ? curr.className : '';
    const isToolbarLike = curr.getAttribute('role') === 'toolbar' ||
      curr.dataset?.testid === 'toolBar' ||
      /(?:^|\s)flex(?:\s|$)|toolbar/i.test(cls);
    if (isToolbarLike && curr.children.length >= 2) {
      return curr;
    }
    curr = curr.parentElement;
    depth++;
  }
  return btn?.parentElement || null;
}

// Check and inject button into Twitter composers (and update if composer context changed)
function injectGeminiButtons() {
  // Query standard toolbars in priority order
  const toolbars = queryAllFirst(document, SELECTORS.toolbar);

  // Per-button fallback: ensure any unmatched submit button (e.g. reply modal when home toolbar exists) also gets a toolbar row
  const submitButtons = queryAllFirst(document, SELECTORS.tweetButton);
  submitButtons.forEach(btn => {
    if (btn.closest('#gemini-floating-hud')) return;
    const alreadyCovered = toolbars.some(tb => tb.contains(btn));
    if (!alreadyCovered) {
      const parentRow = findToolbarContainerForSubmit(btn);
      if (parentRow && !toolbars.includes(parentRow) && !parentRow.closest('#gemini-floating-hud')) {
        toolbars.push(parentRow);
      }
    }
  });

  toolbars.forEach(toolbar => {
    if (toolbar.closest('#gemini-floating-hud')) return;

    const existingWrapper = toolbar.querySelector('.gemini-reply-wrapper');
    if (existingWrapper) {
      const currentMode = detectComposerType(toolbar);
      if (existingWrapper.dataset.composerMode === currentMode) {
        return;
      }
      // Mode changed (e.g., SPA route change or parent tweet hydrated after toolbar), rebuild button
      existingWrapper.replaceWith(createGeminiReplyElement(toolbar));
      return;
    }

    toolbar.setAttribute('data-gemini-injected', 'true');

    const tweetButton = queryFirst(toolbar, SELECTORS.tweetButton) ||
      Array.from(toolbar.querySelectorAll('button')).find(b => /(?:post|reply)/i.test(b.innerText || ''));

    const geminiElement = createGeminiReplyElement(toolbar);

    if (tweetButton && tweetButton.parentElement) {
      let insertTarget = tweetButton;
      while (insertTarget.parentElement &&
             insertTarget.parentElement !== toolbar &&
             insertTarget.parentElement.parentElement &&
             insertTarget.parentElement.parentElement !== toolbar) {
        insertTarget = insertTarget.parentElement;
      }
      if (insertTarget && insertTarget.parentElement) {
        insertTarget.parentElement.insertBefore(geminiElement, insertTarget);
      } else {
        tweetButton.parentElement.insertBefore(geminiElement, tweetButton);
      }
    } else {
      toolbar.appendChild(geminiElement);
    }
  });
}

// Continuous observer for dynamically loaded Twitter composers & theme updates
let debounceTimer = null;
const observer = new MutationObserver(() => {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    syncPageThemeClass();
    injectGeminiButtons();
    if (floatingHudEl && document.body && !document.body.contains(floatingHudEl)) {
      document.body.appendChild(floatingHudEl);
    }
  }, 100);
});

if (document.body) {
  syncPageThemeClass();
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
} else {
  document.addEventListener('DOMContentLoaded', () => {
    syncPageThemeClass();
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }, { once: true });
}

// Initial scan
injectGeminiButtons();

// ========================================================
// Interactive Floating HUD for Twitter / X
// ========================================================
let floatingHudEl = null;

async function initFloatingHud() {
  try {
    const settings = await chrome.storage.local.get(['showFloatingHud', 'defaultTone', 'defaultPostStyle']);
    const showFloatingHud = settings.showFloatingHud !== false;
    const defaultTone = settings.defaultTone || 'quick';
    const defaultPostStyle = settings.defaultPostStyle || 'engaging';

    if (!showFloatingHud) {
      if (floatingHudEl) {
        floatingHudEl.remove();
        floatingHudEl = null;
      }
      return;
    }

    if (!document.body) {
      document.addEventListener('DOMContentLoaded', () => initFloatingHud(), { once: true });
      return;
    }

    if (floatingHudEl && document.body.contains(floatingHudEl)) {
      return;
    }

    createFloatingHud(defaultTone, defaultPostStyle);
  } catch (e) {
    console.warn('[Twitter-AI] Error initializing Floating HUD:', e);
  }
}

function clampHudPosition(hudEl) {
  if (!hudEl) return;
  const rect = hudEl.getBoundingClientRect();
  const hudWidth = hudEl.offsetWidth || rect.width || 310;
  const hudHeight = hudEl.offsetHeight || rect.height || 120;

  let newLeft = rect.left;
  let newTop = rect.top;
  let adjusted = false;

  const rightMargin = 20;
  const leftMargin = 12;
  const topMargin = 12;
  const bottomMargin = 16;

  if (newLeft + hudWidth > window.innerWidth - rightMargin) {
    newLeft = Math.max(leftMargin, window.innerWidth - hudWidth - rightMargin);
    adjusted = true;
  }
  if (newTop + hudHeight > window.innerHeight - bottomMargin) {
    newTop = Math.max(topMargin, window.innerHeight - hudHeight - bottomMargin);
    adjusted = true;
  }
  if (newLeft < leftMargin) {
    newLeft = leftMargin;
    adjusted = true;
  }
  if (newTop < topMargin) {
    newTop = topMargin;
    adjusted = true;
  }

  if (adjusted) {
    hudEl.style.left = `${newLeft}px`;
    hudEl.style.top = `${newTop}px`;
    hudEl.style.bottom = 'auto';
    hudEl.style.right = 'auto';
  }
}

function makeDraggable(handleEl, hudEl, onClickWhenNotDragged = null) {
  let startX = 0, startY = 0;
  let startLeft = 0, startTop = 0;
  let isDragging = false;
  let pointerId = null;

  const getHudLeft = () => hudEl.getBoundingClientRect().left;
  const getHudTop = () => hudEl.getBoundingClientRect().top;

  handleEl.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    if (e.target.closest('button, select, textarea, input, .gemini-hud-engine-chip, .gemini-hud-pill-expand-btn')) return;

    e.preventDefault();
    isDragging = false;
    pointerId = e.pointerId;

    startX = e.clientX;
    startY = e.clientY;
    startLeft = getHudLeft();
    startTop = getHudTop();

    try { handleEl.setPointerCapture(pointerId); } catch (err) {}

    const onMove = (me) => {
      if (me.pointerId !== pointerId) return;
      const dx = me.clientX - startX;
      const dy = me.clientY - startY;

      if (!isDragging && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
        isDragging = true;
      }

      if (isDragging) {
        const hudW = hudEl.offsetWidth;
        const hudH = hudEl.offsetHeight;
        const rightMargin = 20;
        const leftMargin = 12;
        const topMargin = 12;
        const bottomMargin = 16;
        const newLeft = Math.max(leftMargin, Math.min(window.innerWidth - hudW - rightMargin, startLeft + dx));
        const newTop  = Math.max(topMargin, Math.min(window.innerHeight - hudH - bottomMargin, startTop  + dy));
        hudEl.style.left   = `${newLeft}px`;
        hudEl.style.top    = `${newTop}px`;
        hudEl.style.bottom = 'auto';
        hudEl.style.right  = 'auto';
      }
    };

    const onUp = (ue) => {
      if (ue.pointerId !== pointerId) return;
      handleEl.removeEventListener('pointermove', onMove);
      handleEl.removeEventListener('pointerup', onUp);
      handleEl.removeEventListener('pointercancel', onUp);
      try { handleEl.releasePointerCapture(pointerId); } catch (err) {}

      if (isDragging) {
        const rect = hudEl.getBoundingClientRect();
        const posPayload = { left: rect.left, top: rect.top };
        try {
          localStorage.setItem('gemini_hud_pos', JSON.stringify(posPayload));
        } catch (err) {}
        try {
          chrome.storage?.local?.set({ hudPosition: posPayload });
        } catch (err) {}
      } else if (onClickWhenNotDragged) {
        onClickWhenNotDragged(ue);
      }
    };

    handleEl.addEventListener('pointermove', onMove);
    handleEl.addEventListener('pointerup', onUp);
    handleEl.addEventListener('pointercancel', onUp);
  });
}

function createFloatingHud(defaultTone, defaultPostStyle) {
  if (floatingHudEl) floatingHudEl.remove();

  const hud = document.createElement('div');
  hud.id = 'gemini-floating-hud';
  hud.className = 'gemini-hud-collapsed';

  const applyHudPos = (pos) => {
    if (pos && typeof pos.left === 'number' && typeof pos.top === 'number' && !isNaN(pos.left) && !isNaN(pos.top)) {
      const safeLeft = Math.max(16, Math.min(window.innerWidth - 160, pos.left));
      const safeTop = Math.max(16, Math.min(window.innerHeight - 80, pos.top));
      hud.style.left = `${safeLeft}px`;
      hud.style.top = `${safeTop}px`;
      hud.style.bottom = 'auto';
      hud.style.right = 'auto';
    }
  };

  try {
    const savedPos = localStorage.getItem('gemini_hud_pos');
    if (savedPos) {
      applyHudPos(JSON.parse(savedPos));
    }
  } catch (err) {}

  chrome.storage?.local?.get(['hudPosition']).then(res => {
    if (res?.hudPosition) {
      applyHudPos(res.hudPosition);
    }
  }).catch(() => {});

  const pill = document.createElement('div');
  pill.className = 'gemini-hud-pill';
  pill.title = 'Drag to move — click ❯ to expand';

  const pillDragIcon = document.createElement('span');
  pillDragIcon.className = 'gemini-hud-pill-drag';
  pillDragIcon.textContent = '⠿';
  pillDragIcon.title = 'Drag to reposition';

  const pillBadge = document.createElement('div');
  pillBadge.className = 'gemini-hud-pill-badge';
  pillBadge.innerHTML = `<span class="gemini-sparkle-icon">✦</span><span class="gemini-hud-pill-text">X AI</span>`;

  const pillDotEl = document.createElement('span');
  pillDotEl.className = 'gemini-hud-status-dot';
  pillDotEl.id = 'gemini-hud-pill-dot';
  pillDotEl.title = 'Engine status';

  const expandBtn = document.createElement('button');
  expandBtn.type = 'button';
  expandBtn.className = 'gemini-hud-pill-expand-btn';
  expandBtn.innerHTML = '❯';
  expandBtn.title = 'Expand HUD';
  expandBtn.addEventListener('pointerdown', (e) => e.stopPropagation());

  pill.appendChild(pillDragIcon);
  pill.appendChild(pillBadge);
  pill.appendChild(pillDotEl);
  pill.appendChild(expandBtn);

  const ENGINES = [
    { id: 'nano',       label: 'Nano',     cls: 'nano-active' },
    { id: 'cloud_api',  label: 'Cloud',    cls: 'cloud-active' },
    { id: 'custom_api', label: 'Custom',   cls: 'custom-active' },
    { id: 'headless',   label: 'Headless', cls: 'headless-active' },
    { id: 'web_tab',    label: 'Web',      cls: 'web-active' }
  ];
  let currentEngine = 'cloud_api';

  const card = document.createElement('div');
  card.className = 'gemini-hud-card';

  const header = document.createElement('div');
  header.className = 'gemini-hud-header';
  header.id = 'gemini-hud-header-drag';
  header.innerHTML = `
    <div class="gemini-hud-drag-handle" title="Drag to move">
      <span class="gemini-hud-drag-icon">⠿</span>
      <span class="gemini-sparkle-icon">✦</span>
      <span class="gemini-hud-title">X AI Assistant</span>
    </div>
    <div class="gemini-hud-header-actions">
      <button type="button" class="gemini-hud-icon-btn" id="gemini-hud-refresh-btn" title="Refresh Engine Status">🔄</button>
      <button type="button" class="gemini-hud-icon-btn" id="gemini-hud-collapse-btn" title="Collapse HUD">—</button>
    </div>
  `;

  const body = document.createElement('div');
  body.className = 'gemini-hud-body';

  const statusBar = document.createElement('div');
  statusBar.className = 'gemini-hud-status-bar';
  statusBar.innerHTML = `
    <span class="gemini-hud-status-dot" id="gemini-hud-card-dot"></span>
    <span class="gemini-hud-status-text" id="gemini-hud-status-text">Checking AI engine...</span>
  `;

  const engineRow = document.createElement('div');
  engineRow.className = 'gemini-hud-engine-row';

  const engineLabel = document.createElement('span');
  engineLabel.className = 'gemini-hud-label';
  engineLabel.textContent = 'ENGINE';
  engineRow.appendChild(engineLabel);

  const engineChips = document.createElement('div');
  engineChips.className = 'gemini-hud-engine-chips';

  function setActiveChip(engineId) {
    currentEngine = engineId;
    engineChips.querySelectorAll('.gemini-hud-engine-chip').forEach(chip => {
      chip.classList.remove('active', 'nano-active', 'cloud-active', 'custom-active', 'headless-active', 'web-active');
    });
    const activeChip = engineChips.querySelector(`[data-engine="${engineId}"]`);
    if (activeChip) {
      const eng = ENGINES.find(e => e.id === engineId);
      activeChip.classList.add('active', eng ? eng.cls : '');
    }
  }

  ENGINES.forEach(eng => {
    const chip = document.createElement('span');
    chip.className = 'gemini-hud-engine-chip';
    chip.dataset.engine = eng.id;
    chip.textContent = eng.label;
    chip.title = `Switch to ${eng.label} engine`;
    chip.addEventListener('click', async (e) => {
      e.stopPropagation();
      setActiveChip(eng.id);
      try {
        await chrome.storage.local.set({ engine: eng.id });
        showToast(`✦ Engine: ${eng.label}`, 'info');
        updateEngineStatusBadge(hud);
      } catch (err) {}
    });
    engineChips.appendChild(chip);
  });

  engineRow.appendChild(engineChips);

  chrome.storage.local.get(['engine']).then(s => {
    setActiveChip(s.engine || 'cloud_api');
  }).catch(() => setActiveChip('cloud_api'));

  const rowSelectors = document.createElement('div');
  rowSelectors.className = 'gemini-hud-row';

  const colTone = document.createElement('div');
  colTone.className = 'gemini-hud-col';
  colTone.innerHTML = `<label class="gemini-hud-label">Reply Tone</label>`;
  const selectTone = document.createElement('select');
  selectTone.className = 'gemini-hud-select';
  selectTone.id = 'gemini-hud-tone-select';
  TONES.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = `${t.icon} ${t.label}`;
    if (t.id === defaultTone) opt.selected = true;
    selectTone.appendChild(opt);
  });
  selectTone.addEventListener('change', async () => {
    try {
      await chrome.storage.local.set({ defaultTone: selectTone.value });
      const found = TONES.find(t => t.id === selectTone.value);
      showToast(`✦ Default reply tone set to: ${found ? found.label : selectTone.value}`, 'info');
    } catch (e) {}
  });
  colTone.appendChild(selectTone);

  const colStyle = document.createElement('div');
  colStyle.className = 'gemini-hud-col';
  colStyle.innerHTML = `<label class="gemini-hud-label">Post Style</label>`;
  const selectStyle = document.createElement('select');
  selectStyle.className = 'gemini-hud-select';
  selectStyle.id = 'gemini-hud-style-select';
  POST_STYLES.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = `${s.icon} ${s.label}`;
    if (s.id === defaultPostStyle) opt.selected = true;
    selectStyle.appendChild(opt);
  });
  selectStyle.addEventListener('change', async () => {
    try {
      await chrome.storage.local.set({ defaultPostStyle: selectStyle.value });
      const found = POST_STYLES.find(s => s.id === selectStyle.value);
      showToast(`✦ Default post style set to: ${found ? found.label : selectStyle.value}`, 'info');
    } catch (e) {}
  });
  colStyle.appendChild(selectStyle);

  rowSelectors.appendChild(colTone);
  rowSelectors.appendChild(colStyle);

  // Max Reply & Post Length Row
  const lengthsRow = document.createElement('div');
  lengthsRow.className = 'gemini-hud-lengths-row';
  lengthsRow.innerHTML = `
    <div class="gemini-hud-length-field">
      <label class="gemini-hud-label" for="gemini-hud-reply-max">Reply Max</label>
      <div class="gemini-hud-length-box">
        <input type="number" class="gemini-hud-length-input" id="gemini-hud-reply-max" min="20" max="4000" step="10" value="280">
        <span class="gemini-hud-length-unit">ch</span>
      </div>
    </div>
    <div class="gemini-hud-length-field">
      <label class="gemini-hud-label" for="gemini-hud-post-max">Post Max</label>
      <div class="gemini-hud-length-box">
        <input type="number" class="gemini-hud-length-input" id="gemini-hud-post-max" min="20" max="4000" step="10" value="280">
        <span class="gemini-hud-length-unit">ch</span>
      </div>
    </div>
  `;

  const inputReplyMax = lengthsRow.querySelector('#gemini-hud-reply-max');
  const inputPostMax = lengthsRow.querySelector('#gemini-hud-post-max');

  const clampHudLength = (v) => {
    const n = parseInt(v, 10);
    if (isNaN(n)) return 280;
    return Math.min(4000, Math.max(20, n));
  };

  chrome.storage.local.get(['maxReplyLength', 'maxPostLength']).then(s => {
    if (inputReplyMax) inputReplyMax.value = clampHudLength(s?.maxReplyLength ?? 280);
    if (inputPostMax) inputPostMax.value = clampHudLength(s?.maxPostLength ?? 280);
  }).catch(() => {});

  const bindHudLengthInput = (el, storageKey, label) => {
    if (!el) return;
    let timer = null;
    const commit = async () => {
      const clamped = clampHudLength(el.value);
      el.value = clamped;
      try {
        await chrome.storage.local.set({ [storageKey]: clamped });
        showToast(`✦ ${label} set to ${clamped} chars`, 'info');
      } catch (e) {}
    };
    el.addEventListener('input', () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(commit, 450);
    });
    el.addEventListener('change', () => {
      if (timer) clearTimeout(timer);
      commit();
    });
  };

  bindHudLengthInput(inputReplyMax, 'maxReplyLength', 'Reply max length');
  bindHudLengthInput(inputPostMax, 'maxPostLength', 'Post max length');

  const instructionsBox = document.createElement('div');
  instructionsBox.className = 'gemini-hud-instructions';
  instructionsBox.innerHTML = `
    <label class="gemini-hud-label">Custom Prompt Instruction</label>
    <div class="gemini-hud-instructions-input-wrap">
      <textarea class="gemini-hud-instructions-textarea" id="gemini-hud-instructions-input" placeholder="e.g., Concise, no emojis, authentic..." rows="3"></textarea>
      <button type="button" class="gemini-hud-save-btn" id="gemini-hud-save-btn" title="Save custom instructions">Save</button>
    </div>
  `;

  const textareaInstructions = instructionsBox.querySelector('#gemini-hud-instructions-input');
  const btnSaveInstructions = instructionsBox.querySelector('#gemini-hud-save-btn');

  chrome.storage.local.get(['customInstructions']).then(s => {
    if (s && s.customInstructions !== undefined) {
      textareaInstructions.value = s.customInstructions;
    }
  }).catch(() => {});

  btnSaveInstructions.addEventListener('click', async (e) => {
    e.stopPropagation();
    const val = textareaInstructions.value.trim();
    try {
      await chrome.storage.local.set({ customInstructions: val });
      btnSaveInstructions.textContent = 'Saved! ✓';
      btnSaveInstructions.classList.add('saved');
      showToast('✦ Custom prompt instruction saved!', 'success');
      setTimeout(() => {
        btnSaveInstructions.textContent = 'Save';
        btnSaveInstructions.classList.remove('saved');
      }, 1500);
    } catch (err) {
      showToast('Failed to save instructions', 'error');
    }
  });

  textareaInstructions.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      btnSaveInstructions.click();
    }
  });

  const drafter = document.createElement('div');
  drafter.className = 'gemini-hud-drafter';
  drafter.innerHTML = `
    <label class="gemini-hud-label">Quick Post Drafter</label>
    <textarea class="gemini-hud-textarea" id="gemini-hud-topic-input" placeholder="Topic or idea to tweet about..." rows="2"></textarea>
    <button type="button" class="gemini-hud-draft-btn" id="gemini-hud-draft-btn">
      <span class="gemini-sparkle-icon">✦</span>
      <span id="gemini-hud-draft-text">Draft & Open Tweet</span>
    </button>
  `;

  const btnDraft = drafter.querySelector('#gemini-hud-draft-btn');
  btnDraft.addEventListener('click', (e) => {
    e.stopPropagation();
    handleHudDraft(hud);
  });

  const textareaDraft = drafter.querySelector('#gemini-hud-topic-input');
  textareaDraft.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleHudDraft(hud);
    }
  });

  body.appendChild(statusBar);
  body.appendChild(engineRow);
  body.appendChild(rowSelectors);
  body.appendChild(lengthsRow);
  body.appendChild(instructionsBox);
  body.appendChild(drafter);

  card.appendChild(header);
  card.appendChild(body);

  hud.appendChild(pill);
  hud.appendChild(card);

  document.body.appendChild(hud);
  floatingHudEl = hud;
  console.log('[Twitter-AI] Floating HUD widget mounted to page successfully.');

  const expandHud = () => {
    hud.classList.remove('gemini-hud-collapsed');
    hud.classList.add('gemini-hud-expanded');
    clampHudPosition(hud);
    updateEngineStatusBadge(hud);
    setTimeout(() => {
      textareaDraft.focus();
    }, 100);
  };

  const collapseHud = () => {
    hud.classList.remove('gemini-hud-expanded');
    hud.classList.add('gemini-hud-collapsed');
    clampHudPosition(hud);
  };

  const btnCollapse = header.querySelector('#gemini-hud-collapse-btn');
  btnCollapse.addEventListener('click', (e) => {
    e.stopPropagation();
    collapseHud();
  });

  const btnRefresh = header.querySelector('#gemini-hud-refresh-btn');
  btnRefresh.addEventListener('click', (e) => {
    e.stopPropagation();
    updateEngineStatusBadge(hud);
  });

  makeDraggable(pill, hud, null);

  expandBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    expandHud();
  });

  makeDraggable(header, hud, null);

  hud.setActiveChip = setActiveChip;

  updateEngineStatusBadge(hud);
}

async function updateEngineStatusBadge(hudEl) {
  if (!hudEl) return;
  const cardDot = hudEl.querySelector('#gemini-hud-card-dot');
  const pillDot = hudEl.querySelector('#gemini-hud-pill-dot');
  const statusText = hudEl.querySelector('#gemini-hud-status-text');

  if (statusText) statusText.textContent = 'Checking AI engine...';

  try {
    const resp = await sendRuntimeMessage({ type: 'CHECK_ENGINE_STATUS' });

    const connected = !!(resp && resp.connected);
    const isWarning = resp?.statusText === 'Download Needed' || resp?.statusText === 'Downloading';
    const engineName = resp?.engine === 'nano'
      ? 'Nano'
      : resp?.engine === 'cloud_api'
        ? 'Cloud API'
        : resp?.engine === 'custom_api'
          ? 'Custom API'
          : resp?.engine === 'headless'
            ? 'Headless'
            : 'Web Tab';
    const statusStr = resp?.statusText || (connected ? 'Ready' : 'Offline');

    const dotClass = `gemini-hud-status-dot ${connected ? 'connected' : (isWarning ? 'warning' : 'disconnected')}`;
    if (cardDot) cardDot.className = dotClass;
    if (pillDot) pillDot.className = dotClass;

    if (statusText) {
      statusText.textContent = `${engineName}: ${statusStr}`;
      statusText.title = resp?.message || '';
    }
  } catch (e) {
    if (cardDot) cardDot.className = 'gemini-hud-status-dot disconnected';
    if (pillDot) pillDot.className = 'gemini-hud-status-dot disconnected';
    if (statusText) statusText.textContent = 'Engine: Offline';
  }
}

async function handleHudDraft(hudEl) {
  const textarea = hudEl.querySelector('#gemini-hud-topic-input');
  const draftBtn = hudEl.querySelector('#gemini-hud-draft-btn');
  const draftText = hudEl.querySelector('#gemini-hud-draft-text');
  const styleSelect = hudEl.querySelector('#gemini-hud-style-select');

  if (!draftBtn || draftBtn.classList.contains('loading')) return;

  const topic = (textarea?.value || '').trim();
  if (!topic) {
    showToast('Please enter a topic or thought for your tweet.', 'info');
    textarea?.focus();
    return;
  }

  const chosenStyle = styleSelect ? styleSelect.value : 'engaging';

  const engineInfo = await getActiveEngineDisplayInfo();
  draftBtn.classList.add('loading');
  const originalText = draftText.textContent;
  draftText.innerHTML = `<span class="gemini-spinner"></span> ${engineInfo.btnLabel}`;

  const startTime = Date.now();
  try {
    showToast(`✦ Generating tweet with ${engineInfo.toastLabel}...`, 'info');

    const response = await sendRuntimeMessage({
      type: 'GENERATE_POST',
      payload: {
        topicOrDraft: topic,
        isDraft: false,
        style: chosenStyle
      }
    });

    if (!response || !response.success) {
      showGenerationErrorToast(response, engineInfo.toastLabel, 'Failed to generate tweet.');
      return;
    }

    const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
    const engineLabel = response?.engine ? ` via ${response.engine}` : '';
    const postContent = response.post;

    const modalEl = document.querySelector('div[role="dialog"]');
    let editor = (modalEl ? queryFirst(modalEl, SELECTORS.editor) : null) || queryFirst(document, SELECTORS.editor);

    if (!editor) {
      const composeBtn = queryFirst(document, SELECTORS.composeNavBtn);
      if (composeBtn) {
        composeBtn.click();
        for (let i = 0; i < 15; i++) {
          await new Promise(r => setTimeout(r, 100));
          const dlg = document.querySelector('div[role="dialog"]');
          editor = (dlg ? queryFirst(dlg, SELECTORS.editor) : null) || queryFirst(document, SELECTORS.editor);
          if (editor) break;
        }
      }
    }

    if (editor) {
      await insertTextIntoEditor(editor, postContent);
      showToast(`✦ Tweet drafted${engineLabel} in ${durationSec}s!`, 'success');
      if (textarea) textarea.value = '';
      hudEl.classList.remove('gemini-hud-expanded');
      hudEl.classList.add('gemini-hud-collapsed');
      clampHudPosition(hudEl);
    } else {
      try {
        await navigator.clipboard.writeText(postContent);
        showToast(`✦ Tweet drafted${engineLabel} in ${durationSec}s (copied to clipboard)!`, 'success');
        if (textarea) textarea.value = '';
      } catch (clipErr) {
        showToast(`✦ Tweet drafted${engineLabel} in ${durationSec}s: ` + postContent.substring(0, 50) + '...', 'info');
      }
    }
  } catch (err) {
    console.error('[Twitter-AI] HUD Post draft failed:', err);
    showToast(`Error: ${err.message || 'Draft failed'}`, 'error');
  } finally {
    draftBtn.classList.remove('loading');
    draftText.textContent = originalText;
  }
}

// Storage change listener to keep HUD synchronized
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;

  if (changes.showFloatingHud) {
    if (changes.showFloatingHud.newValue) {
      initFloatingHud();
    } else if (floatingHudEl) {
      floatingHudEl.remove();
      floatingHudEl = null;
    }
  }

  if (floatingHudEl) {
    if (changes.defaultTone) {
      const toneSelect = floatingHudEl.querySelector('#gemini-hud-tone-select');
      if (toneSelect) toneSelect.value = changes.defaultTone.newValue;
    }
    if (changes.defaultPostStyle) {
      const styleSelect = floatingHudEl.querySelector('#gemini-hud-style-select');
      if (styleSelect) styleSelect.value = changes.defaultPostStyle.newValue;
    }
    if (changes.engine) {
      if (typeof floatingHudEl.setActiveChip === 'function') {
        floatingHudEl.setActiveChip(changes.engine.newValue);
      }
      updateEngineStatusBadge(floatingHudEl);
    }
    if (changes.customInstructions) {
      const textarea = floatingHudEl.querySelector('#gemini-hud-instructions-input');
      if (textarea && textarea !== document.activeElement) {
        textarea.value = changes.customInstructions.newValue || '';
      }
    }
    if (changes.maxReplyLength) {
      const el = floatingHudEl.querySelector('#gemini-hud-reply-max');
      if (el && el !== document.activeElement) {
        el.value = changes.maxReplyLength.newValue ?? 280;
      }
    }
    if (changes.maxPostLength) {
      const el = floatingHudEl.querySelector('#gemini-hud-post-max');
      if (el && el !== document.activeElement) {
        el.value = changes.maxPostLength.newValue ?? 280;
      }
    }
  }
});

// Keep HUD in viewport on browser resize
let hudResizeTimer = null;
window.addEventListener('resize', () => {
  if (hudResizeTimer) clearTimeout(hudResizeTimer);
  hudResizeTimer = setTimeout(() => {
    if (floatingHudEl) clampHudPosition(floatingHudEl);
  }, 150);
});

// Initialize HUD on load
initFloatingHud();