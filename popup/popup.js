// popup.js - Multi-Engine Controller for Twitter AI Reply extension

document.addEventListener('DOMContentLoaded', async () => {
  const statusBadge = document.getElementById('status-badge');
  const statusText = document.getElementById('status-text');
  const sessionTitle = document.getElementById('session-title');
  const sessionDesc = document.getElementById('session-desc');
  const btnOpenGemini = document.getElementById('btn-open-gemini');

  const engineRadios = document.querySelectorAll('input[name="engine"]');
  const engineOptions = document.querySelectorAll('.engine-option');
  const rowAutoclose = document.getElementById('row-autoclose');
  const autoCloseToggle = document.getElementById('auto-close-toggle');
  const floatingHudToggle = document.getElementById('floating-hud-toggle');

  const defaultToneSelect = document.getElementById('default-tone');
  const customInstructionsEl = document.getElementById('custom-instructions');

  const btnTest = document.getElementById('btn-test');
  const testInput = document.getElementById('test-input');
  const testOutput = document.getElementById('test-output');
  const saveStatus = document.getElementById('save-status');

  // Tabs navigation
  const tabBtnSettings = document.getElementById('tab-btn-settings');
  const tabBtnCreator = document.getElementById('tab-btn-creator');
  const panelSettings = document.getElementById('panel-settings');
  const panelCreator = document.getElementById('panel-creator');

  function switchTab(tab) {
    if (tab === 'creator') {
      tabBtnCreator.classList.add('active');
      tabBtnSettings.classList.remove('active');
      panelCreator.classList.add('active');
      panelSettings.classList.remove('active');
    } else {
      tabBtnSettings.classList.add('active');
      tabBtnCreator.classList.remove('active');
      panelSettings.classList.add('active');
      panelCreator.classList.remove('active');
    }
  }

  if (tabBtnSettings && tabBtnCreator) {
    tabBtnSettings.addEventListener('click', () => switchTab('settings'));
    tabBtnCreator.addEventListener('click', () => switchTab('creator'));
  }

  // Preferences elements
  const defaultPostStyleSelect = document.getElementById('default-post-style');

  // Post Creator elements
  const postTopicInput = document.getElementById('post-topic-input');
  const postStyleSelect = document.getElementById('post-style-select');
  const btnGeneratePost = document.getElementById('btn-generate-post');
  const btnGeneratePostText = document.getElementById('btn-generate-post-text');
  const postOutputContainer = document.getElementById('post-output-container');
  const postOutputText = document.getElementById('post-output-text');
  const postOutputError = document.getElementById('post-output-error');
  const postOutputActions = document.getElementById('post-output-actions');
  const postCharCount = document.getElementById('post-char-count');
  const btnCopyPost = document.getElementById('btn-copy-post');
  const btnOpenXPost = document.getElementById('btn-open-x-post');

  function flashSaved() {
    saveStatus.classList.add('show');
    setTimeout(() => saveStatus.classList.remove('show'), 1500);
  }

  // Load saved preferences
  const settings = await chrome.storage.local.get([
    'engine',
    'defaultTone',
    'defaultPostStyle',
    'customInstructions',
    'autoCloseTab',
    'showFloatingHud'
  ]);

  const currentEngine = settings.engine || 'nano';
  setEngineUI(currentEngine);

  if (settings.defaultTone) defaultToneSelect.value = settings.defaultTone;
  if (settings.defaultPostStyle && defaultPostStyleSelect) defaultPostStyleSelect.value = settings.defaultPostStyle;
  if (settings.defaultPostStyle && postStyleSelect) postStyleSelect.value = settings.defaultPostStyle;
  if (settings.customInstructions !== undefined) customInstructionsEl.value = settings.customInstructions;
  if (settings.autoCloseTab !== undefined) autoCloseToggle.checked = settings.autoCloseTab;
  if (floatingHudToggle) {
    floatingHudToggle.checked = settings.showFloatingHud !== false;
  }

  // Engine selection handler
  function setEngineUI(engineValue) {
    engineOptions.forEach(opt => {
      const radio = opt.querySelector('input[type="radio"]');
      if (radio.value === engineValue) {
        radio.checked = true;
        opt.classList.add('active');
      } else {
        opt.classList.remove('active');
      }
    });

    // Show "Open Gemini" button only when Web Tab is selected
    if (engineValue === 'web_tab') {
      btnOpenGemini.style.display = 'inline-flex';
      rowAutoclose.style.display = 'flex';
      sessionTitle.textContent = 'Gemini Web Tab Status';
    } else if (engineValue === 'headless') {
      btnOpenGemini.style.display = 'none';
      rowAutoclose.style.display = 'none';
      sessionTitle.textContent = 'Headless Cookie Status';
    } else {
      btnOpenGemini.style.display = 'none';
      rowAutoclose.style.display = 'none';
      sessionTitle.textContent = 'Gemini Nano (Local AI) Status';
    }
  }

  engineRadios.forEach(radio => {
    radio.addEventListener('change', async () => {
      const selected = radio.value;
      setEngineUI(selected);
      await chrome.storage.local.set({ engine: selected });
      flashSaved();
      checkStatus();
    });
  });

  // Save other settings
  defaultToneSelect.addEventListener('change', async () => {
    await chrome.storage.local.set({ defaultTone: defaultToneSelect.value });
    flashSaved();
  });

  if (defaultPostStyleSelect) {
    defaultPostStyleSelect.addEventListener('change', async () => {
      await chrome.storage.local.set({ defaultPostStyle: defaultPostStyleSelect.value });
      if (postStyleSelect) postStyleSelect.value = defaultPostStyleSelect.value;
      flashSaved();
    });
  }

  const DEFAULT_CUSTOM_INSTRUCTIONS = 'Keep output concise, under 260 characters. No hashtags. No quotation marks. Be natural, authentic, and human.';
  const btnSaveInstructions = document.getElementById('btn-save-instructions');
  const btnResetInstructions = document.getElementById('btn-reset-instructions');

  let saveTimer = null;
  customInstructionsEl.addEventListener('input', () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      await chrome.storage.local.set({ customInstructions: customInstructionsEl.value });
      flashSaved();
    }, 400);
  });

  if (btnSaveInstructions) {
    btnSaveInstructions.addEventListener('click', async () => {
      const val = customInstructionsEl.value.trim();
      await chrome.storage.local.set({ customInstructions: val });
      flashSaved();

      const originalHtml = btnSaveInstructions.innerHTML;
      btnSaveInstructions.innerHTML = '<span>✓ Saved!</span>';
      btnSaveInstructions.classList.add('btn-success');
      setTimeout(() => {
        btnSaveInstructions.innerHTML = originalHtml;
        btnSaveInstructions.classList.remove('btn-success');
      }, 1500);
    });
  }

  if (btnResetInstructions) {
    btnResetInstructions.addEventListener('click', async () => {
      customInstructionsEl.value = DEFAULT_CUSTOM_INSTRUCTIONS;
      await chrome.storage.local.set({ customInstructions: DEFAULT_CUSTOM_INSTRUCTIONS });
      flashSaved();

      const originalHtml = btnResetInstructions.innerHTML;
      btnResetInstructions.innerHTML = '<span>✓ Reset!</span>';
      btnResetInstructions.style.color = 'var(--success)';
      setTimeout(() => {
        btnResetInstructions.innerHTML = originalHtml;
        btnResetInstructions.style.color = '';
      }, 1500);
    });
  }

  autoCloseToggle.addEventListener('change', async () => {
    await chrome.storage.local.set({ autoCloseTab: autoCloseToggle.checked });
    flashSaved();
  });

  if (floatingHudToggle) {
    floatingHudToggle.addEventListener('change', async () => {
      const isEnabled = floatingHudToggle.checked;
      await chrome.storage.local.set({ showFloatingHud: isEnabled });
      flashSaved();
    });
  }

  // Check connection status of selected engine
  async function checkStatus() {
    statusBadge.className = 'status-badge checking';
    statusText.textContent = 'Checking...';
    sessionDesc.textContent = 'Verifying engine readiness...';

    try {
      const resp = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'CHECK_ENGINE_STATUS' }, resolve);
      });

      if (!resp) {
        setOffline('Service Worker unavailable. Reload extension.');
        return;
      }

      if (resp.connected) {
        statusBadge.className = 'status-badge online';
        statusText.textContent = resp.statusText || 'Ready';
        sessionDesc.textContent = resp.message || 'Engine ready to generate replies.';
      } else {
        statusBadge.className = 'status-badge offline';
        statusText.textContent = resp.statusText || 'Offline';
        sessionDesc.textContent = resp.message || 'Engine unavailable.';
      }
    } catch (e) {
      setOffline('Connection error.');
    }
  }

  function setOffline(msg) {
    statusBadge.className = 'status-badge offline';
    statusText.textContent = 'Offline';
    sessionDesc.textContent = msg;
  }

  // Refresh status when badge is clicked
  statusBadge.addEventListener('click', checkStatus);

  // Open Gemini Tab button
  btnOpenGemini.addEventListener('click', async () => {
    btnOpenGemini.disabled = true;
    try {
      await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'OPEN_GEMINI' }, resolve);
      });
      setTimeout(checkStatus, 1000);
      setTimeout(checkStatus, 3000);
    } finally {
      btnOpenGemini.disabled = false;
    }
  });

  // Test reply generation
  btnTest.addEventListener('click', async () => {
    const text = testInput.value.trim();
    if (!text) {
      testInput.focus();
      return;
    }

    btnTest.disabled = true;
    btnTest.textContent = 'Generating...';
    testOutput.style.display = 'block';
    testOutput.textContent = 'Querying active AI engine...';

    try {
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({
          type: 'GENERATE_REPLY',
          payload: {
            tweetText: text,
            tweetAuthor: 'TestUser',
            tone: defaultToneSelect.value
          }
        }, resolve);
      });

      if (response && response.success) {
        testOutput.textContent = '';
        const titleEl = document.createElement('strong');
        titleEl.textContent = `✦ [${response.engine || 'Engine'}] Reply:`;
        const brEl = document.createElement('br');
        const replyEl = document.createElement('span');
        replyEl.textContent = `"${response.reply}"`;
        testOutput.appendChild(titleEl);
        testOutput.appendChild(brEl);
        testOutput.appendChild(replyEl);
      } else {
        testOutput.textContent = `❌ Error: ${response?.message || response?.error || 'Failed to generate response.'}`;
      }
    } catch (err) {
      testOutput.textContent = `❌ Error: ${err.message}`;
    } finally {
      btnTest.disabled = false;
      btnTest.textContent = 'Generate';
      checkStatus();
    }
  });

  // Post Creator Output char counter
  function updateCharCount() {
    if (!postOutputText || !postCharCount) return;
    const len = postOutputText.innerText.trim().length;
    postCharCount.textContent = `${len} / 280`;
    if (len > 280) {
      postCharCount.classList.add('over-limit');
    } else {
      postCharCount.classList.remove('over-limit');
    }
  }

  if (postOutputText) {
    postOutputText.addEventListener('input', updateCharCount);
  }

  // Generate Tweet button in Post Creator
  if (btnGeneratePost) {
    btnGeneratePost.addEventListener('click', async () => {
      const topic = postTopicInput ? postTopicInput.value.trim() : '';
      if (!topic) {
        if (postTopicInput) postTopicInput.focus();
        return;
      }

      btnGeneratePost.disabled = true;
      if (btnGeneratePostText) btnGeneratePostText.textContent = 'Generating ✦...';
      if (postOutputContainer) postOutputContainer.style.display = 'block';
      if (postOutputError) postOutputError.style.display = 'none';
      if (postOutputText) {
        postOutputText.style.display = 'block';
        postOutputText.textContent = 'Crafting tweet with active AI engine...';
      }
      if (postOutputActions) postOutputActions.style.display = 'flex';
      updateCharCount();

      try {
        const response = await new Promise((resolve) => {
          chrome.runtime.sendMessage({
            type: 'GENERATE_POST',
            payload: {
              topicOrDraft: topic,
              isDraft: false,
              style: postStyleSelect ? postStyleSelect.value : 'engaging'
            }
          }, resolve);
        });

        if (response && response.success) {
          if (postOutputError) postOutputError.style.display = 'none';
          if (postOutputText) {
            postOutputText.style.display = 'block';
            postOutputText.innerText = response.post;
          }
          if (postOutputActions) postOutputActions.style.display = 'flex';
          updateCharCount();
        } else {
          const errMsg = response?.message || response?.error || 'Failed to generate post.';
          if (postOutputError) {
            postOutputError.style.display = 'block';
            postOutputError.textContent = `❌ ${errMsg}`;
          }
          if (postOutputText) postOutputText.style.display = 'none';
          if (postOutputActions) postOutputActions.style.display = 'none';
          if (postCharCount) postCharCount.textContent = '0 / 280';
        }
      } catch (err) {
        if (postOutputError) {
          postOutputError.style.display = 'block';
          postOutputError.textContent = `❌ Error: ${err.message}`;
        }
        if (postOutputText) postOutputText.style.display = 'none';
        if (postOutputActions) postOutputActions.style.display = 'none';
        if (postCharCount) postCharCount.textContent = '0 / 280';
      } finally {
        btnGeneratePost.disabled = false;
        if (btnGeneratePostText) btnGeneratePostText.textContent = 'Generate Tweet ✦';
        checkStatus();
      }
    });
  }

  // Copy Post to Clipboard
  if (btnCopyPost) {
    btnCopyPost.addEventListener('click', async () => {
      if (!postOutputText) return;
      const text = postOutputText.innerText.trim();
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        const originalHtml = btnCopyPost.innerHTML;
        btnCopyPost.innerHTML = '<span>✓ Copied!</span>';
        setTimeout(() => {
          btnCopyPost.innerHTML = originalHtml;
        }, 2000);
      } catch (e) {
        console.error('Clipboard copy failed:', e);
      }
    });
  }

  // Open & Post directly on Twitter/X
  if (btnOpenXPost) {
    btnOpenXPost.addEventListener('click', () => {
      if (!postOutputText) return;
      const text = postOutputText.innerText.trim();
      if (!text) return;
      const url = `https://x.com/compose/post?text=${encodeURIComponent(text)}`;
      chrome.tabs.create({ url });
    });
  }

  // Check Gemini Nano guide button
  const btnCheckNano = document.getElementById('btn-check-nano');
  if (btnCheckNano) {
    btnCheckNano.addEventListener('click', () => {
      chrome.tabs.create({
        url: 'https://github.com/gomedz/twitter-auto-reply/blob/main/check_gemini_nano.md'
      });
    });
  }

  // Donate section toggle & links
  const btnDonateToggle = document.getElementById('btn-donate-toggle');
  const donateInfo = document.getElementById('donate-info');
  const donateArrow = document.getElementById('donate-arrow');
  const btnCopyCrypto = document.getElementById('btn-copy-crypto');
  const cryptoAddress = document.getElementById('crypto-address');

  if (btnDonateToggle && donateInfo) {
    btnDonateToggle.addEventListener('click', () => {
      const isHidden = donateInfo.style.display === 'none' || !donateInfo.style.display;
      donateInfo.style.display = isHidden ? 'flex' : 'none';
      if (donateArrow) {
        donateArrow.classList.toggle('open', isHidden);
      }
      if (isHidden) {
        donateInfo.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
    });
  }

  // Copy crypto address
  async function copyCryptoAddress() {
    if (!cryptoAddress) return;
    const text = cryptoAddress.textContent.trim();
    try {
      await navigator.clipboard.writeText(text);
      if (btnCopyCrypto) {
        const originalText = btnCopyCrypto.textContent;
        btnCopyCrypto.textContent = 'Copied!';
        btnCopyCrypto.classList.add('copied');
        setTimeout(() => {
          btnCopyCrypto.textContent = originalText;
          btnCopyCrypto.classList.remove('copied');
        }, 2000);
      }
    } catch (err) {
      console.error('Failed to copy crypto address:', err);
    }
  }

  if (btnCopyCrypto) {
    btnCopyCrypto.addEventListener('click', (e) => {
      e.stopPropagation();
      copyCryptoAddress();
    });
  }

  if (cryptoAddress) {
    cryptoAddress.addEventListener('click', () => {
      copyCryptoAddress();
    });
  }

  // Make external links clickable in new Chrome tabs
  if (donateInfo) {
    const donateLinks = donateInfo.querySelectorAll('a[href]');
    donateLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const url = link.getAttribute('href');
        if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
          chrome.tabs.create({ url });
        }
      });
    });
  }

  // Initial status check
  checkStatus();
});
