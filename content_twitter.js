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

// Show floating toast notification on Twitter
function showToast(message, type = 'info', actionBtn = null) {
  // Remove existing toast if any
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

// Find tweet text and author for context
function extractTweetContext(composerEl) {
  // Check if inside a modal reply dialog
  const modal = composerEl.closest('div[role="dialog"]');
  if (modal) {
    const tweetEl = modal.querySelector('article[data-testid="tweet"]');
    if (tweetEl) {
      const textEl = tweetEl.querySelector('div[data-testid="tweetText"]');
      const authorEl = tweetEl.querySelector('div[data-testid="User-Name"]');
      return {
        text: textEl ? textEl.innerText.trim() : '',
        author: authorEl ? extractAuthorHandle(authorEl) : ''
      };
    }
  }

  // If inline reply on status page
  const closestTweet = composerEl.closest('article[data-testid="tweet"]');
  if (closestTweet) {
    const textEl = closestTweet.querySelector('div[data-testid="tweetText"]');
    const authorEl = closestTweet.querySelector('div[data-testid="User-Name"]');
    return {
      text: textEl ? textEl.innerText.trim() : '',
      author: authorEl ? extractAuthorHandle(authorEl) : ''
    };
  }

  // Look above the inline reply container in the DOM tree
  let current = composerEl;
  while (current && current !== document.body) {
    const prevTweet = current.previousElementSibling?.querySelector?.('article[data-testid="tweet"]')
      || (current.previousElementSibling?.matches?.('article[data-testid="tweet"]') ? current.previousElementSibling : null);

    if (prevTweet) {
      const textEl = prevTweet.querySelector('div[data-testid="tweetText"]');
      const authorEl = prevTweet.querySelector('div[data-testid="User-Name"]');
      const text = textEl ? textEl.innerText.trim() : '';
      if (text) {
        return {
          text: text,
          author: authorEl ? extractAuthorHandle(authorEl) : ''
        };
      }
    }
    current = current.parentElement;
  }

  // Fallback to the main tweet only on an individual tweet status page
  if (window.location.pathname.includes('/status/')) {
    const mainTweet = document.querySelector('article[data-testid="tweet"]');
    if (mainTweet) {
      const textEl = mainTweet.querySelector('div[data-testid="tweetText"]');
      const authorEl = mainTweet.querySelector('div[data-testid="User-Name"]');
      return {
        text: textEl ? textEl.innerText.trim() : '',
        author: authorEl ? extractAuthorHandle(authorEl) : ''
      };
    }
  }

  return { text: '', author: '' };
}

// Extract handle from author container
function extractAuthorHandle(authorEl) {
  const text = authorEl.innerText || '';
  const match = text.match(/@([A-Za-z0-9_]+)/);
  return match ? match[1] : '';
}

// Locate the DraftJS contenteditable editor associated with this composer
function findAssociatedEditor(composerEl) {
  // 1. Check if inside a modal reply dialog
  const modal = composerEl.closest('div[role="dialog"]');
  if (modal) {
    const editor = modal.querySelector('div[data-testid^="tweetTextarea_"][role="textbox"], div[role="textbox"][contenteditable="true"]');
    if (editor) return editor;
  }

  // 2. Look in parent containers up the DOM tree (up to 8 levels)
  let parent = composerEl.parentElement;
  let levels = 0;
  while (parent && parent !== document.body && levels < 8) {
    const editor = parent.querySelector('div[data-testid^="tweetTextarea_"][role="textbox"], div[role="textbox"][contenteditable="true"]');
    if (editor) return editor;
    parent = parent.parentElement;
    levels++;
  }

  // 3. Fallback to any visible editor on page
  return document.querySelector('div[data-testid^="tweetTextarea_"][role="textbox"], div[role="textbox"][contenteditable="true"]');
}

// Insert reply text into Twitter's editor.
//
// Strategy hierarchy:
//   1. InputEvent('beforeinput', insertText) — goes through the editor's own
//      event handler, updating its internal content model properly (backspace/delete
//      work). Unlike execCommand('insertText'), there is NO parallel native DOM
//      mutation, so the text appears only once (no doubling).
//   2. ClipboardEvent('paste') — fallback if beforeinput is not processed.
//   3. Direct innerText assignment — emergency fallback.
//
// After insertion, a deferred check verifies the text appeared and places the
// cursor at the end with a 'selectionchange' dispatch so the editor syncs its
// internal cursor offset from the native selection.
function insertTextIntoEditor(editor, text) {
  if (!editor) return false;

  editor.focus();

  // Select any existing content so new text replaces it
  const sel = window.getSelection();
  if (sel) {
    const range = document.createRange();
    range.selectNodeContents(editor);
    sel.removeAllRanges();
    sel.addRange(range);
    // Let the editor sync its internal selection state from the native selection
    document.dispatchEvent(new Event('selectionchange'));
  }

  // Primary: beforeinput(insertText) — editor processes this and updates its
  // internal content model. No native DOM side-effect = no doubling.
  editor.dispatchEvent(new InputEvent('beforeinput', {
    inputType: 'insertText',
    data: text,
    bubbles: true,
    cancelable: true
  }));
  editor.dispatchEvent(new InputEvent('input', {
    inputType: 'insertText',
    data: text,
    bubbles: true
  }));

  // Deferred: verify the text actually appeared. If the editor didn't handle
  // the beforeinput event, fall back to paste, then innerText.
  setTimeout(() => {
    const content = (editor.textContent || '').trim();
    const probe = text.substring(0, Math.min(20, text.length));

    if (!content.includes(probe)) {
      // beforeinput wasn't handled — try ClipboardEvent paste
      editor.focus();
      document.execCommand('selectAll', false, null);
      let inserted = false;
      try {
        const dt = new DataTransfer();
        dt.setData('text/plain', text);
        editor.dispatchEvent(new ClipboardEvent('paste', {
          bubbles: true,
          cancelable: true,
          clipboardData: dt
        }));
        inserted = true;
      } catch (e) {}

      if (!inserted) {
        // Last resort: direct DOM write
        editor.innerText = text;
        editor.dispatchEvent(new Event('input', { bubbles: true }));
        editor.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    // Place cursor at end after React has re-rendered
    placeCursorAtEnd(editor);
  }, 120);

  return true;
}

// Move cursor to end of editor and sync the editor's internal selection state.
function placeCursorAtEnd(editor) {
  try {
    editor.focus();
    const sel = window.getSelection();
    if (!sel) return;
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false); // collapse to end
    sel.removeAllRanges();
    sel.addRange(range);
    // The editor framework listens to document 'selectionchange' to sync its
    // internal cursor offset from the native selection.
    document.dispatchEvent(new Event('selectionchange'));
  } catch (e) {}
}

// Handle generating reply for a selected tone
async function triggerAutoReply(containerEl, actionBtnEl, toneId, composerEl) {
  const context = extractTweetContext(composerEl);

  if (!context.text) {
    showToast('Could not find a tweet to reply to. Open a tweet or thread to use AI Reply.', 'info');
    return;
  }

  const editor = findAssociatedEditor(composerEl);
  if (!editor) {
    showToast('Could not find the reply input area.', 'error');
    return;
  }

  // Update button state to loading
  const originalHtml = actionBtnEl.innerHTML;
  containerEl.classList.add('loading');
  actionBtnEl.innerHTML = `<span class="gemini-spinner"></span> <span>✦ Gemini...</span>`;

  showToast('✦ Generating reply with Gemini...', 'info');

  try {
    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage({
        type: 'GENERATE_REPLY',
        payload: {
          tweetText: context.text,
          tweetAuthor: context.author,
          tone: toneId
        }
      }, resolve);
    });

    if (!response || !response.success) {
      const errorMsg = response?.message || 'Failed to generate reply.';

      if (response?.error === 'NOT_LOGGED_IN' || response?.error === 'NO_TAB') {
        showToast('Please log in to Gemini at gemini.google.com', 'error', {
          text: 'Open Gemini',
          onClick: () => chrome.runtime.sendMessage({ type: 'OPEN_GEMINI' })
        });
      } else {
        showToast(`Gemini error: ${errorMsg}`, 'error');
      }
      return;
    }

    const replyText = response.reply;
    const inserted = insertTextIntoEditor(editor, replyText);

    if (inserted) {
      showToast('✦ Reply generated and inserted!', 'success');
    } else {
      showToast('Could not auto-fill reply box. Text copied to clipboard!', 'info');
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
    containerEl.classList.remove('loading');
    actionBtnEl.innerHTML = originalHtml;
  }
}

// Create the Gemini Auto Reply split-button element
function createGeminiReplyElement(composerToolbar) {
  const wrapper = document.createElement('div');
  wrapper.className = 'gemini-reply-wrapper';

  const splitBtn = document.createElement('div');
  splitBtn.className = 'gemini-reply-btn';

  // Primary action button (generates reply using default tone)
  const btnMain = document.createElement('button');
  btnMain.type = 'button';
  btnMain.className = 'gemini-reply-action';
  btnMain.title = 'AI Auto Reply (Click to generate with default tone)';
  btnMain.innerHTML = `
    <span class="gemini-sparkle-icon">✦</span>
    <span>AI Reply</span>
  `;

  // Visual divider
  const divider = document.createElement('div');
  divider.className = 'gemini-reply-divider';

  // Arrow trigger button (opens tone selection menu)
  const btnArrow = document.createElement('button');
  btnArrow.type = 'button';
  btnArrow.className = 'gemini-reply-arrow';
  btnArrow.title = 'Choose reply tone';
  btnArrow.innerHTML = `<span class="gemini-arrow-icon">▾</span>`;

  splitBtn.appendChild(btnMain);
  splitBtn.appendChild(divider);
  splitBtn.appendChild(btnArrow);

  // Tone dropdown menu
  const menu = document.createElement('div');
  menu.className = 'gemini-tone-menu';
  menu.style.display = 'none';

  const menuHeader = document.createElement('div');
  menuHeader.className = 'gemini-tone-header';
  menuHeader.textContent = 'Reply Tone';
  menu.appendChild(menuHeader);

  const arrowSpan = btnArrow.querySelector('.gemini-arrow-icon');

  TONES.forEach(tone => {
    const item = document.createElement('div');
    item.className = 'gemini-tone-item';
    item.innerHTML = `
      <span class="gemini-tone-icon">${tone.icon}</span>
      <span>${tone.label}</span>
    `;

    item.addEventListener('click', (e) => {
      e.stopPropagation();
      if (splitBtn.classList.contains('loading')) return;
      menu.style.display = 'none';
      arrowSpan.classList.remove('open');
      triggerAutoReply(splitBtn, btnMain, tone.id, composerToolbar);
    });

    menu.appendChild(item);
  });

  // Clicking main button generates with user default tone
  btnMain.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (splitBtn.classList.contains('loading')) return;

    menu.style.display = 'none';
    arrowSpan.classList.remove('open');

    let preferredTone = 'quick';
    try {
      const settings = await chrome.storage.local.get(['defaultTone']);
      if (settings && settings.defaultTone) {
        preferredTone = settings.defaultTone;
      }
    } catch (err) {}

    triggerAutoReply(splitBtn, btnMain, preferredTone, composerToolbar);
  });

  // Clicking arrow button toggles tone menu
  btnArrow.addEventListener('click', (e) => {
    e.stopPropagation();
    if (splitBtn.classList.contains('loading')) return;

    const isOpen = menu.style.display === 'flex';
    if (isOpen) {
      menu.style.display = 'none';
      arrowSpan.classList.remove('open');
    } else {
      // Close other open menus
      document.querySelectorAll('.gemini-tone-menu').forEach(m => m.style.display = 'none');
      document.querySelectorAll('.gemini-arrow-icon').forEach(a => a.classList.remove('open'));

      menu.style.display = 'flex';
      arrowSpan.classList.add('open');
    }
  });

  // Close menu when clicking outside
  document.addEventListener('click', (e) => {
    if (!wrapper.contains(e.target)) {
      menu.style.display = 'none';
      arrowSpan.classList.remove('open');
    }
  });

  wrapper.appendChild(splitBtn);
  wrapper.appendChild(menu);

  return wrapper;
}

// Check and inject button into Twitter composers
function injectGeminiButtons() {
  // Find all Twitter toolbars in reply areas
  const toolbars = document.querySelectorAll('div[data-testid="toolBar"]:not([data-gemini-injected])');

  toolbars.forEach(toolbar => {
    toolbar.setAttribute('data-gemini-injected', 'true');

    // Find the rightmost action container (usually has tweetButtonInline or tweetButton)
    const tweetButton = toolbar.querySelector('div[data-testid="tweetButtonInline"], div[data-testid="tweetButton"]');

    const geminiElement = createGeminiReplyElement(toolbar);

    if (tweetButton && tweetButton.parentElement) {
      // Place directly before the Tweet button for a clean integrated look
      tweetButton.parentElement.insertBefore(geminiElement, tweetButton);
    } else {
      // Append to the toolbar
      toolbar.appendChild(geminiElement);
    }
  });
}

// Continuous observer for dynamically loaded Twitter composers
let debounceTimer = null;
const observer = new MutationObserver(() => {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    injectGeminiButtons();
  }, 100);
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});

// Initial scan
injectGeminiButtons();
