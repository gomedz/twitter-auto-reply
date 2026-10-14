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

// Find tweet text and author for context
function extractTweetContext(composerEl) {
  // 1. Check if inside a modal reply dialog (pick the last tweet above the composer in a thread modal)
  const modal = composerEl.closest('div[role="dialog"]');
  if (modal) {
    const tweetEls = modal.querySelectorAll('article[data-testid="tweet"]');
    if (tweetEls.length > 0) {
      const targetTweet = tweetEls[tweetEls.length - 1];
      const textEl = targetTweet.querySelector('div[data-testid="tweetText"]');
      const authorEl = targetTweet.querySelector('div[data-testid="User-Name"]');
      return {
        text: textEl ? textEl.innerText.trim() : '',
        author: authorEl ? extractAuthorHandle(authorEl) : ''
      };
    }
  }

  // 2. If inline reply directly inside an article[data-testid="tweet"]
  const closestTweet = composerEl.closest('article[data-testid="tweet"]');
  if (closestTweet) {
    const textEl = closestTweet.querySelector('div[data-testid="tweetText"]');
    const authorEl = closestTweet.querySelector('div[data-testid="User-Name"]');
    return {
      text: textEl ? textEl.innerText.trim() : '',
      author: authorEl ? extractAuthorHandle(authorEl) : ''
    };
  }

  // 3. Walk all preceding siblings up the DOM tree above the inline reply container
  let current = composerEl;
  while (current && current !== document.body) {
    let prev = current.previousElementSibling;
    while (prev) {
      const tweetMatches = prev.matches?.('article[data-testid="tweet"]')
        ? [prev]
        : Array.from(prev.querySelectorAll?.('article[data-testid="tweet"]') || []);
      if (tweetMatches.length > 0) {
        const targetTweet = tweetMatches[tweetMatches.length - 1];
        const textEl = targetTweet.querySelector('div[data-testid="tweetText"]');
        const authorEl = targetTweet.querySelector('div[data-testid="User-Name"]');
        const text = textEl ? textEl.innerText.trim() : '';
        if (text) {
          return {
            text: text,
            author: authorEl ? extractAuthorHandle(authorEl) : ''
          };
        }
      }
      prev = prev.previousElementSibling;
    }
    current = current.parentElement;
  }

  // 4. Fallback to the focal/main tweet on an individual tweet status page
  if (window.location.pathname.includes('/status/')) {
    const mainTweet = document.querySelector('article[data-testid="tweet"][tabindex="-1"]')
      || document.querySelector('article[data-testid="tweet"]');
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
  const modal = composerEl.closest('div[role="dialog"]');
  if (modal) {
    const editor = modal.querySelector('div[data-testid^="tweetTextarea_"][role="textbox"], div[role="textbox"][contenteditable="true"]');
    if (editor) return editor;
  }

  let parent = composerEl.parentElement;
  let levels = 0;
  while (parent && parent !== document.body && levels < 8) {
    const editor = parent.querySelector('div[data-testid^="tweetTextarea_"][role="textbox"], div[role="textbox"][contenteditable="true"]');
    if (editor) return editor;
    parent = parent.parentElement;
    levels++;
  }

  return document.querySelector('div[data-testid^="tweetTextarea_"][role="textbox"], div[role="textbox"][contenteditable="true"]');
}

// Insert reply or post text into Twitter's Draft.js editor cleanly (Async to allow React/Draft.js state sync)
async function insertTextIntoEditor(editor, text) {
  if (!editor || !text) return false;

  const currentContent = (editor.innerText || editor.textContent || '').trim();
  if (currentContent === text.trim()) return true;

  editor.focus();

  // Step 1: Select all existing content and allow Draft.js to sync its internal SelectionState
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

    await new Promise(r => setTimeout(r, 25));

    try {
      document.execCommand('delete', false, null);
    } catch (e) {}

    await new Promise(r => setTimeout(r, 20));
  }

  // Step 2: Dispatch synthetic paste event for Draft.js editOnPaste handler
  try {
    const dt = new DataTransfer();
    dt.setData('text/plain', text);
    editor.dispatchEvent(new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData: dt
    }));
  } catch (e) {}

  // Allow React 18 to flush DOM updates before verifying insertion
  await new Promise(r => setTimeout(r, 40));

  let updatedContent = (editor.innerText || editor.textContent || '').trim();
  const textSample = text.trim().substring(0, Math.min(20, text.trim().length));

  if (!updatedContent || !updatedContent.includes(textSample)) {
    try {
      document.execCommand('insertText', false, text);
    } catch (e) {}
    await new Promise(r => setTimeout(r, 25));
    updatedContent = (editor.innerText || editor.textContent || '').trim();
  }

  // Step 3: Dispatch input and change events so Twitter's React state updates
  editor.dispatchEvent(new Event('input', { bubbles: true }));
  editor.dispatchEvent(new Event('change', { bubbles: true }));

  // Step 4: Place cursor cleanly at the end
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

  const originalHtml = actionBtnEl.innerHTML;
  containerEl.classList.add('loading');
  actionBtnEl.innerHTML = `<span class="gemini-spinner"></span> <span>✦ Gemini...</span>`;

  const startTime = Date.now();
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
      const isAuthIssue = response?.error === 'NOT_LOGGED_IN' ||
                          response?.error === 'NO_TAB' ||
                          /not logged in|session token|log in|no gemini tab/i.test(errorMsg);
      const isApiKeyIssue = response?.error === 'API_KEY_ERROR' ||
                            /api key|api_key/i.test(errorMsg);

      if (isAuthIssue) {
        showToast('Please log in to Gemini at gemini.google.com', 'error', {
          text: 'Open Gemini',
          onClick: () => chrome.runtime.sendMessage({ type: 'OPEN_GEMINI' })
        });
      } else if (isApiKeyIssue) {
        showToast('Gemini API key missing or invalid. Check extension settings.', 'error');
      } else {
        showToast(`Gemini error: ${errorMsg}`, 'error');
      }
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

// Determine whether a composer is for replying to a tweet or creating a new post
function detectComposerType(composerEl) {
  const modal = composerEl.closest('div[role="dialog"]');
  if (modal) {
    const hasParentTweet = !!modal.querySelector('article[data-testid="tweet"]');
    return hasParentTweet ? 'reply' : 'new_post';
  }

  if (composerEl.closest('article[data-testid="tweet"]')) {
    return 'reply';
  }

  if (window.location.pathname.includes('/status/')) {
    return 'reply';
  }

  let current = composerEl;
  while (current && current !== document.body) {
    let prev = current.previousElementSibling;
    while (prev) {
      if (prev.matches?.('article[data-testid="tweet"]') || prev.querySelector?.('article[data-testid="tweet"]')) {
        return 'reply';
      }
      prev = prev.previousElementSibling;
    }
    current = current.parentElement;
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

  const popover = document.createElement('div');
  popover.className = 'gemini-post-popover';

  const header = document.createElement('div');
  header.className = 'gemini-popover-header';
  header.innerHTML = `
    <div class="gemini-popover-title">
      <span class="gemini-sparkle-icon">✦</span>
      <span>Create AI Post</span>
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
  textarea.placeholder = 'What should this post be about? (e.g. "3 lessons from building in public in 2026")';
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

// Handle generating a new post (either by polishing draft or using a topic)
async function triggerAutoPost(containerEl, actionBtnEl, styleId, composerToolbar, customTopic = null) {
  if (!containerEl || containerEl.dataset.busy === 'true' || containerEl.classList.contains('loading')) return;
  containerEl.dataset.busy = 'true';

  const editor = findAssociatedEditor(composerToolbar);
  if (!editor) {
    delete containerEl.dataset.busy;
    showToast('Could not find the tweet input area.', 'error');
    return;
  }

  const currentDraft = (editor.innerText || editor.textContent || '').trim();
  const wrapper = composerToolbar.querySelector('.gemini-reply-wrapper') || containerEl.closest('.gemini-reply-wrapper');

  if (!customTopic && !currentDraft) {
    delete containerEl.dataset.busy;
    showPostPromptPopover(wrapper, composerToolbar, styleId);
    showToast('Enter a topic or idea in the prompt bar to generate your post.', 'info');
    return;
  }

  const topicOrDraft = customTopic || currentDraft;
  const isDraft = !customTopic && !!currentDraft;

  const originalHtml = actionBtnEl.innerHTML;
  containerEl.classList.add('loading');
  actionBtnEl.innerHTML = `<span class="gemini-spinner"></span> <span>✦ Gemini...</span>`;

  showToast(isDraft ? '✦ Polishing tweet draft with Gemini...' : '✦ Generating post with Gemini...', 'info');

  try {
    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage({
        type: 'GENERATE_POST',
        payload: {
          topicOrDraft: topicOrDraft,
          isDraft: isDraft,
          style: styleId
        }
      }, resolve);
    });

    if (!response || !response.success) {
      const errorMsg = response?.message || 'Failed to generate post.';
      const isAuthIssue = response?.error === 'NOT_LOGGED_IN' ||
                          response?.error === 'NO_TAB' ||
                          /not logged in|session token|log in|no gemini tab/i.test(errorMsg);
      const isApiKeyIssue = response?.error === 'API_KEY_ERROR' ||
                            /api key|api_key/i.test(errorMsg);

      if (isAuthIssue) {
        showToast('Please log in to Gemini at gemini.google.com', 'error', {
          text: 'Open Gemini',
          onClick: () => chrome.runtime.sendMessage({ type: 'OPEN_GEMINI' })
        });
      } else if (isApiKeyIssue) {
        showToast('Gemini API key missing or invalid. Check extension settings.', 'error');
      } else {
        showToast(`Gemini error: ${errorMsg}`, 'error');
      }
      return;
    }

    const postText = response.post;
    const inserted = await insertTextIntoEditor(editor, postText);

    if (inserted) {
      showToast(isDraft ? '✦ Tweet polished and updated!' : '✦ New post generated and inserted!', 'success');
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

// Create the Gemini Auto Reply / Post split-button element
function createGeminiReplyElement(composerToolbar) {
  const composerType = detectComposerType(composerToolbar);
  const isPost = composerType === 'new_post';

  const wrapper = document.createElement('div');
  wrapper.className = `gemini-reply-wrapper ${isPost ? 'mode-post' : 'mode-reply'}`;
  wrapper.dataset.composerMode = composerType;

  const splitBtn = document.createElement('div');
  splitBtn.className = 'gemini-reply-btn';

  const btnMain = document.createElement('button');
  btnMain.type = 'button';
  btnMain.className = 'gemini-reply-action';
  btnMain.title = isPost
    ? 'AI Post (Click to polish draft or enter topic)'
    : 'AI Auto Reply (Click to generate with default tone)';
  btnMain.innerHTML = `
    <span class="gemini-sparkle-icon">✦</span>
    <span>${isPost ? 'AI Post' : 'AI Reply'}</span>
  `;

  const divider = document.createElement('div');
  divider.className = 'gemini-reply-divider';

  const btnArrow = document.createElement('button');
  btnArrow.type = 'button';
  btnArrow.className = 'gemini-reply-arrow';
  btnArrow.title = isPost ? 'Choose post style or enter topic' : 'Choose reply tone';
  btnArrow.innerHTML = `<span class="gemini-arrow-icon">▾</span>`;

  splitBtn.appendChild(btnMain);
  splitBtn.appendChild(divider);
  splitBtn.appendChild(btnArrow);

  const menu = document.createElement('div');
  menu.className = 'gemini-tone-menu';
  menu.style.display = 'none';

  const menuHeader = document.createElement('div');
  menuHeader.className = 'gemini-tone-header';
  menuHeader.textContent = isPost ? 'Post Style' : 'Reply Tone';
  menu.appendChild(menuHeader);

  const arrowSpan = btnArrow.querySelector('.gemini-arrow-icon');

  if (isPost) {
    const promptItem = document.createElement('div');
    promptItem.className = 'gemini-tone-item gemini-tone-item-prompt';
    promptItem.innerHTML = `
      <span class="gemini-tone-icon">💡</span>
      <span style="font-weight: 600;">Enter Topic / Idea...</span>
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

  btnMain.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (splitBtn.dataset.busy === 'true' || splitBtn.classList.contains('loading')) return;
    splitBtn.dataset.busy = 'true';

    menu.style.display = 'none';
    arrowSpan.classList.remove('open');

    if (isPost) {
      let preferredStyle = 'engaging';
      try {
        const settings = await chrome.storage.local.get(['defaultPostStyle']);
        if (settings && settings.defaultPostStyle) {
          preferredStyle = settings.defaultPostStyle;
        }
      } catch (err) {}
      delete splitBtn.dataset.busy;
      triggerAutoPost(splitBtn, btnMain, preferredStyle, composerToolbar);
    } else {
      let preferredTone = 'quick';
      try {
        const settings = await chrome.storage.local.get(['defaultTone']);
        if (settings && settings.defaultTone) {
          preferredTone = settings.defaultTone;
        }
      } catch (err) {}
      delete splitBtn.dataset.busy;
      triggerAutoReply(splitBtn, btnMain, preferredTone, composerToolbar);
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

// Check and inject button into Twitter composers (and update if composer context changed)
function injectGeminiButtons() {
  const toolbars = document.querySelectorAll('div[data-testid="toolBar"]');

  toolbars.forEach(toolbar => {
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

    const tweetButton = toolbar.querySelector('[data-testid="tweetButtonInline"], [data-testid="tweetButton"]');
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

// Continuous observer for dynamically loaded Twitter composers
let debounceTimer = null;
const observer = new MutationObserver(() => {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    injectGeminiButtons();
    if (floatingHudEl && document.body && !document.body.contains(floatingHudEl)) {
      document.body.appendChild(floatingHudEl);
    }
  }, 100);
});

if (document.body) {
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
} else {
  document.addEventListener('DOMContentLoaded', () => {
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
        try {
          localStorage.setItem('gemini_hud_pos', JSON.stringify({ left: rect.left, top: rect.top }));
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

  try {
    const savedPos = localStorage.getItem('gemini_hud_pos');
    if (savedPos) {
      const pos = JSON.parse(savedPos);
      if (typeof pos.left === 'number' && typeof pos.top === 'number' && !isNaN(pos.left) && !isNaN(pos.top)) {
        const safeLeft = Math.max(16, Math.min(window.innerWidth - 160, pos.left));
        const safeTop = Math.max(16, Math.min(window.innerHeight - 80, pos.top));
        hud.style.left = `${safeLeft}px`;
        hud.style.top = `${safeTop}px`;
        hud.style.bottom = 'auto';
        hud.style.right = 'auto';
      }
    }
  } catch (err) {}

  const pill = document.createElement('div');
  pill.className = 'gemini-hud-pill';
  pill.title = 'Drag to move — click ❯ to expand';

  const pillDragIcon = document.createElement('span');
  pillDragIcon.className = 'gemini-hud-pill-drag';
  pillDragIcon.textContent = '⠿';
  pillDragIcon.title = 'Drag to reposition';

  const pillBadge = document.createElement('div');
  pillBadge.className = 'gemini-hud-pill-badge';
  pillBadge.innerHTML = `<span class="gemini-sparkle-icon">✦</span><span class="gemini-hud-pill-text">Gemini AI</span>`;

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
    { id: 'nano',      label: 'Nano',      cls: 'nano-active' },
    { id: 'cloud_api', label: 'Cloud API', cls: 'cloud-active' },
    { id: 'headless',  label: 'Headless',  cls: 'headless-active' },
    { id: 'web_tab',   label: 'Web',       cls: 'web-active' }
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
      <span class="gemini-hud-title">Gemini Assistant</span>
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
      chip.classList.remove('active', 'nano-active', 'cloud-active', 'headless-active', 'web-active');
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
    const resp = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'CHECK_ENGINE_STATUS' }, resolve);
    });

    const connected = !!(resp && resp.connected);
    const isWarning = resp?.statusText === 'Download Needed' || resp?.statusText === 'Downloading';
    const engineName = resp?.engine === 'nano' ? 'Nano' : resp?.engine === 'cloud_api' ? 'Cloud API' : resp?.engine === 'headless' ? 'Headless' : 'Web Tab';
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

  draftBtn.classList.add('loading');
  const originalText = draftText.textContent;
  draftText.innerHTML = `<span class="gemini-spinner"></span> Generating...`;

  const startTime = Date.now();
  try {
    showToast('✦ Generating tweet with Gemini...', 'info');

    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage({
        type: 'GENERATE_POST',
        payload: {
          topicOrDraft: topic,
          isDraft: false,
          style: chosenStyle
        }
      }, resolve);
    });

    if (!response || !response.success) {
      const errMsg = response?.message || 'Failed to generate tweet.';
      const isAuthIssue = response?.error === 'NOT_LOGGED_IN' ||
                          response?.error === 'NO_TAB' ||
                          /not logged in|session token|log in|no gemini tab/i.test(errMsg);
      const isApiKeyIssue = response?.error === 'API_KEY_ERROR' ||
                            /api key|api_key/i.test(errMsg);

      if (isAuthIssue) {
        showToast('Please log in to Gemini at gemini.google.com', 'error', {
          text: 'Open Gemini',
          onClick: () => chrome.runtime.sendMessage({ type: 'OPEN_GEMINI' })
        });
      } else if (isApiKeyIssue) {
        showToast('Gemini API key missing or invalid. Check extension settings.', 'error');
      } else {
        showToast(`Gemini error: ${errMsg}`, 'error');
      }
      return;
    }

    const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
    const engineLabel = response?.engine ? ` via ${response.engine}` : '';
    const postContent = response.post;

    let editor = document.querySelector('div[role="dialog"] div[data-testid^="tweetTextarea_"][role="textbox"], div[role="dialog"] div[role="textbox"][contenteditable="true"]')
      || document.querySelector('div[data-testid^="tweetTextarea_"][role="textbox"], div[role="textbox"][contenteditable="true"]');

    if (!editor) {
      const composeBtn = document.querySelector(
        'a[data-testid="SideNav_NewTweet_Button"], ' +
        'div[data-testid="SideNav_NewTweet_Button"], ' +
        'a[href="/compose/post"], ' +
        'a[href="/compose/tweet"]'
      );
      if (composeBtn) {
        composeBtn.click();
        for (let i = 0; i < 15; i++) {
          await new Promise(r => setTimeout(r, 100));
          editor = document.querySelector('div[role="dialog"] div[data-testid^="tweetTextarea_"][role="textbox"], div[role="dialog"] div[role="textbox"][contenteditable="true"]')
            || document.querySelector('div[data-testid^="tweetTextarea_"][role="textbox"], div[role="textbox"][contenteditable="true"]');
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