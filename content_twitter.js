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
      return {
        text: textEl ? textEl.innerText.trim() : '',
        author: authorEl ? extractAuthorHandle(authorEl) : ''
      };
    }
    current = current.parentElement;
  }

  // Fallback to the main tweet on the status page
  const mainTweet = document.querySelector('article[data-testid="tweet"]');
  if (mainTweet) {
    const textEl = mainTweet.querySelector('div[data-testid="tweetText"]');
    const authorEl = mainTweet.querySelector('div[data-testid="User-Name"]');
    return {
      text: textEl ? textEl.innerText.trim() : '',
      author: authorEl ? extractAuthorHandle(authorEl) : ''
    };
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
  // Check within the dialog or inline section
  const container = composerEl.closest('div[role="dialog"]')
    || composerEl.closest('div[data-testid^="tweetTextarea_"]')
    || composerEl.closest('div[data-testid="toolBar"]')?.parentElement
    || composerEl.parentElement;

  if (container) {
    const editor = container.querySelector('div[data-testid^="tweetTextarea_"][role="textbox"], div[role="textbox"][contenteditable="true"]');
    if (editor) return editor;
  }

  return document.querySelector('div[data-testid^="tweetTextarea_"][role="textbox"], div[role="textbox"][contenteditable="true"]');
}

// Insert reply text into Twitter's DraftJS editor
function insertTextIntoEditor(editor, text) {
  if (!editor) return false;

  editor.focus();

  // Select existing content so the reply replaces placeholder or previous text cleanly
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(editor);
  selection.removeAllRanges();
  selection.addRange(range);

  // DraftJS properly tracks document.execCommand('insertText')
  const success = document.execCommand('insertText', false, text);

  if (!success) {
    // Fallback: Clipboard Event
    try {
      const clipboardData = new DataTransfer();
      clipboardData.setData('text/plain', text);
      const pasteEvent = new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: clipboardData
      });
      editor.dispatchEvent(pasteEvent);
    } catch (e) {
      editor.innerText = text;
    }
  }

  editor.dispatchEvent(new Event('input', { bubbles: true }));
  editor.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

// Handle generating reply for a selected tone
async function triggerAutoReply(buttonEl, toneId, composerEl) {
  const context = extractTweetContext(composerEl);

  if (!context.text) {
    showToast('Could not find the tweet text to reply to. Please click inside the reply box and try again.', 'error');
    return;
  }

  const editor = findAssociatedEditor(composerEl);
  if (!editor) {
    showToast('Could not find the reply input area.', 'error');
    return;
  }

  // Update button state to loading
  const originalHtml = buttonEl.innerHTML;
  buttonEl.classList.add('loading');
  buttonEl.innerHTML = `<span class="gemini-spinner"></span> <span>✦ Gemini...</span>`;

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
      await navigator.clipboard.writeText(replyText);
    }
  } catch (err) {
    console.error('[Twitter-AI-Reply] Generation error:', err);
    showToast(`Error: ${err.message || 'Communication failure'}`, 'error');
  } finally {
    buttonEl.classList.remove('loading');
    buttonEl.innerHTML = originalHtml;
  }
}

// Create the Gemini Auto Reply button element
function createGeminiReplyElement(composerToolbar) {
  const wrapper = document.createElement('div');
  wrapper.className = 'gemini-reply-wrapper';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'gemini-reply-btn';
  button.title = 'Auto Reply with Gemini (No API Key)';
  button.innerHTML = `
    <span class="gemini-sparkle-icon">✦</span>
    <span>AI Reply</span>
    <span class="gemini-arrow-icon">▾</span>
  `;

  // Tone dropdown menu
  const menu = document.createElement('div');
  menu.className = 'gemini-tone-menu';
  menu.style.display = 'none';

  const menuHeader = document.createElement('div');
  menuHeader.className = 'gemini-tone-header';
  menuHeader.textContent = 'Reply Tone';
  menu.appendChild(menuHeader);

  TONES.forEach(tone => {
    const item = document.createElement('div');
    item.className = 'gemini-tone-item';
    item.innerHTML = `
      <span class="gemini-tone-icon">${tone.icon}</span>
      <span>${tone.label}</span>
    `;

    item.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.style.display = 'none';
      arrow.classList.remove('open');
      triggerAutoReply(button, tone.id, composerToolbar);
    });

    menu.appendChild(item);
  });

  const arrow = button.querySelector('.gemini-arrow-icon');

  // Toggle dropdown on button click
  button.addEventListener('click', (e) => {
    e.stopPropagation();
    if (button.classList.contains('loading')) return;

    const isOpen = menu.style.display === 'flex';
    if (isOpen) {
      menu.style.display = 'none';
      arrow.classList.remove('open');
    } else {
      // Close other open menus
      document.querySelectorAll('.gemini-tone-menu').forEach(m => m.style.display = 'none');
      document.querySelectorAll('.gemini-arrow-icon').forEach(a => a.classList.remove('open'));

      menu.style.display = 'flex';
      arrow.classList.add('open');
    }
  });

  // Close menu when clicking outside
  document.addEventListener('click', (e) => {
    if (!wrapper.contains(e.target)) {
      menu.style.display = 'none';
      arrow.classList.remove('open');
    }
  });

  wrapper.appendChild(button);
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
