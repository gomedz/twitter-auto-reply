// composer.js - Inline AI Reply / Post / Quote Split-Button, Popover & DOM Observer

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

// Display floating topic prompt popover for new posts / quote angles
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

// Create the AI Auto Reply / Post / Quote split-button element
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
  const toolbars = queryAllFirst(document, SELECTORS.toolbar);

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
    if (typeof floatingHudEl !== 'undefined' && floatingHudEl && document.body && !document.body.contains(floatingHudEl)) {
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
