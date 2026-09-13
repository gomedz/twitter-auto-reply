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

  const defaultToneSelect = document.getElementById('default-tone');
  const customInstructionsEl = document.getElementById('custom-instructions');

  const btnTest = document.getElementById('btn-test');
  const testInput = document.getElementById('test-input');
  const testOutput = document.getElementById('test-output');
  const saveStatus = document.getElementById('save-status');

  function flashSaved() {
    saveStatus.classList.add('show');
    setTimeout(() => saveStatus.classList.remove('show'), 1500);
  }

  // Load saved preferences
  const settings = await chrome.storage.local.get([
    'engine',
    'defaultTone',
    'customInstructions',
    'autoCloseTab'
  ]);

  const currentEngine = settings.engine || 'nano';
  setEngineUI(currentEngine);

  if (settings.defaultTone) defaultToneSelect.value = settings.defaultTone;
  if (settings.customInstructions !== undefined) customInstructionsEl.value = settings.customInstructions;
  if (settings.autoCloseTab !== undefined) autoCloseToggle.checked = settings.autoCloseTab;

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

  let saveTimer = null;
  customInstructionsEl.addEventListener('input', () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      await chrome.storage.local.set({ customInstructions: customInstructionsEl.value });
      flashSaved();
    }, 400);
  });

  autoCloseToggle.addEventListener('change', async () => {
    await chrome.storage.local.set({ autoCloseTab: autoCloseToggle.checked });
    flashSaved();
  });

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
        testOutput.innerHTML = `<strong>✦ [${response.engine || 'Engine'}] Reply:</strong><br>"${response.reply}"`;
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
