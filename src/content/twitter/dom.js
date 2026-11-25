// dom.js - X/Twitter DOM Extraction, Composer Detection & Editor Text Insertion

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
  cleaned = cleaned.replace(/[\u200B-\u200F\uFEFF\u2060\u00AD]/g, '').trim();

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

  cleaned = cleaned.replace(/https?:\/\/(?:[a-zA-Z0-9-]+\.)*googleusercontent(?:\.(?:com|org|net)(?:\/[^\s]*)?|\.(?=[A-Z\s]|$)|(?=[\s]|$))/gi, '');
  cleaned = cleaned.replace(/\b(.{10,120}?)\s+\1\b/gi, '$1');

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
