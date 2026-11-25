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

  // Cloud API Elements
  const cloudApiConfig = document.getElementById('cloud-api-config');
  const cloudApiKeyInput = document.getElementById('cloud-api-key');
  const btnToggleKeyVisibility = document.getElementById('btn-toggle-key-visibility');
  const cloudModelSelect = document.getElementById('cloud-model-select');
  const btnTestCloudKey = document.getElementById('btn-test-cloud-key');
  const cloudKeyStatus = document.getElementById('cloud-key-status');

  // Custom API Elements
  const customApiConfigEl = document.getElementById('custom-api-config');
  const customApiPresetSelect = document.getElementById('custom-api-preset');
  const customApiFormatSelect = document.getElementById('custom-api-format');
  const customApiUrlInput = document.getElementById('custom-api-url');
  const customApiKeyInput = document.getElementById('custom-api-key');
  const btnToggleCustomKey = document.getElementById('btn-toggle-custom-key');
  const customApiModelInput = document.getElementById('custom-api-model');
  const customApiModelsDatalist = document.getElementById('custom-api-models-list');
  const btnFetchCustomModels = document.getElementById('btn-fetch-custom-models');
  const customApiHeadersInput = document.getElementById('custom-api-headers');
  const btnTestCustomApi = document.getElementById('btn-test-custom-api');
  const customApiStatus = document.getElementById('custom-api-status');

  // Max Length Elements
  const maxReplyLengthInput = document.getElementById('max-reply-length');
  const maxPostLengthInput = document.getElementById('max-post-length');
  const replyPresetBtns = document.querySelectorAll('.length-presets[data-target="reply"] .length-preset-btn');
  const postPresetBtns = document.querySelectorAll('.length-presets[data-target="post"] .length-preset-btn');

  let currentMaxPostLength = 280;

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

  const CUSTOM_API_PRESETS = {
    openai: { format: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
    openrouter: { format: 'openai', baseUrl: 'https://openrouter.ai/api/v1', model: 'google/gemini-2.5-flash' },
    groq: { format: 'openai', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
    deepseek: { format: 'openai', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
    xai: { format: 'openai', baseUrl: 'https://api.x.ai/v1', model: 'grok-3-mini' },
    anthropic: { format: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', model: 'claude-3-5-haiku-latest' },
    ollama: { format: 'openai', baseUrl: 'http://localhost:11434/v1', model: 'llama3.2' },
    lmstudio: { format: 'openai', baseUrl: 'http://localhost:1234/v1', model: 'local-model' },
    custom: { format: 'openai', baseUrl: '', model: '' }
  };

  function clampLengthValue(val, fallback = 280) {
    const parsed = parseInt(val, 10);
    if (isNaN(parsed)) return fallback;
    return Math.min(4000, Math.max(20, parsed));
  }

  function syncLengthPresetButtons(btns, value) {
    btns.forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.val, 10) === value);
    });
  }

  function applyCustomApiFields(cfg = {}) {
    if (customApiPresetSelect) customApiPresetSelect.value = cfg.preset || 'openai';
    if (customApiFormatSelect) customApiFormatSelect.value = cfg.format || 'openai';
    if (customApiUrlInput && document.activeElement !== customApiUrlInput) customApiUrlInput.value = cfg.baseUrl ?? 'https://api.openai.com/v1';
    if (customApiKeyInput && document.activeElement !== customApiKeyInput) customApiKeyInput.value = cfg.apiKey || '';
    if (customApiModelInput && document.activeElement !== customApiModelInput) customApiModelInput.value = cfg.model || '';
    if (customApiHeadersInput && document.activeElement !== customApiHeadersInput) customApiHeadersInput.value = cfg.customHeaders || '';
  }

  function readCustomApiForm() {
    return {
      preset: customApiPresetSelect ? customApiPresetSelect.value : 'custom',
      format: customApiFormatSelect ? customApiFormatSelect.value : 'openai',
      baseUrl: customApiUrlInput ? customApiUrlInput.value.trim() : '',
      apiKey: customApiKeyInput ? customApiKeyInput.value.trim() : '',
      model: customApiModelInput ? customApiModelInput.value.trim() : '',
      customHeaders: customApiHeadersInput ? customApiHeadersInput.value.trim() : ''
    };
  }

  async function requestCustomApiOriginPermission(rawUrl) {
    if (!rawUrl) return false;
    let originPattern;
    try {
      const parsed = new URL(rawUrl);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
      originPattern = `${parsed.origin}/*`;
    } catch (e) {
      return false;
    }

    if (!chrome?.permissions?.contains || !chrome?.permissions?.request) return true;
    const alreadyGranted = await chrome.permissions.contains({ origins: [originPattern] });
    if (alreadyGranted) return true;
    return await chrome.permissions.request({ origins: [originPattern] });
  }

  // Load saved preferences
  const settings = await chrome.storage.local.get([
    'engine',
    'defaultTone',
    'defaultPostStyle',
    'customInstructions',
    'maxReplyLength',
    'maxPostLength',
    'autoCloseTab',
    'showFloatingHud',
    'apiKey',
    'cloudModel',
    'customApi'
  ]);

  const currentEngine = settings.engine || 'cloud_api';
  setEngineUI(currentEngine);

  if (settings.defaultTone) defaultToneSelect.value = settings.defaultTone;
  if (settings.defaultPostStyle && defaultPostStyleSelect) defaultPostStyleSelect.value = settings.defaultPostStyle;
  if (settings.defaultPostStyle && postStyleSelect) postStyleSelect.value = settings.defaultPostStyle;
  if (settings.customInstructions !== undefined) customInstructionsEl.value = settings.customInstructions;

  const initReplyLen = clampLengthValue(settings.maxReplyLength, 280);
  const initPostLen = clampLengthValue(settings.maxPostLength, 280);
  currentMaxPostLength = initPostLen;
  if (maxReplyLengthInput) maxReplyLengthInput.value = initReplyLen;
  if (maxPostLengthInput) maxPostLengthInput.value = initPostLen;
  syncLengthPresetButtons(replyPresetBtns, initReplyLen);
  syncLengthPresetButtons(postPresetBtns, initPostLen);
  updateCharCount();

  applyCustomApiFields(settings.customApi || CUSTOM_API_PRESETS.openai);

  if (settings.autoCloseTab !== undefined) autoCloseToggle.checked = settings.autoCloseTab;
  if (floatingHudToggle) {
    floatingHudToggle.checked = settings.showFloatingHud !== false;
  }
  if (settings.apiKey && cloudApiKeyInput) cloudApiKeyInput.value = settings.apiKey;
  if (cloudModelSelect) {
    let savedModel = settings.cloudModel || 'gemini-3.5-flash-lite';
    if (/2\.5-pro/i.test(savedModel)) {
      savedModel = 'gemini-4-argon';
      await chrome.storage.local.set({ cloudModel: savedModel });
    } else if (/3\.5-flash(?!-lite)|3\.6-flash|3\.7-flash/i.test(savedModel)) {
      savedModel = 'gemini-4-hydrogen';
      await chrome.storage.local.set({ cloudModel: savedModel });
    } else if (/gemma|1\.5|2\.0|2\.5-flash/i.test(savedModel)) {
      savedModel = 'gemini-3.5-flash-lite';
      await chrome.storage.local.set({ cloudModel: savedModel });
    }
    if (!Array.from(cloudModelSelect.options).some(o => o.value === savedModel)) {
      const opt = document.createElement('option');
      opt.value = savedModel;
      opt.textContent = `${savedModel} (Active)`;
      cloudModelSelect.appendChild(opt);
    }
    cloudModelSelect.value = savedModel;
  }

  // Purge any legacy Gemma options from dropdown
  if (cloudModelSelect) {
    Array.from(cloudModelSelect.options).forEach(opt => {
      if (/gemma/i.test(opt.value) || /gemma/i.test(opt.textContent)) {
        opt.remove();
      }
    });
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

    if (engineValue === 'web_tab') {
      btnOpenGemini.style.display = 'inline-flex';
      rowAutoclose.style.display = 'flex';
      sessionTitle.textContent = 'Gemini Web Tab Status';
      if (cloudApiConfig) cloudApiConfig.style.display = 'none';
      if (customApiConfigEl) customApiConfigEl.style.display = 'none';
    } else if (engineValue === 'cloud_api') {
      btnOpenGemini.style.display = 'none';
      rowAutoclose.style.display = 'none';
      sessionTitle.textContent = 'Google Gemini Cloud API Status';
      if (cloudApiConfig) cloudApiConfig.style.display = 'block';
      if (customApiConfigEl) customApiConfigEl.style.display = 'none';
    } else if (engineValue === 'custom_api') {
      btnOpenGemini.style.display = 'none';
      rowAutoclose.style.display = 'none';
      sessionTitle.textContent = 'Custom API Endpoint Status';
      if (cloudApiConfig) cloudApiConfig.style.display = 'none';
      if (customApiConfigEl) customApiConfigEl.style.display = 'flex';
    } else if (engineValue === 'headless') {
      btnOpenGemini.style.display = 'none';
      rowAutoclose.style.display = 'none';
      sessionTitle.textContent = 'Headless Cookie Status';
      if (cloudApiConfig) cloudApiConfig.style.display = 'none';
      if (customApiConfigEl) customApiConfigEl.style.display = 'none';
    } else {
      btnOpenGemini.style.display = 'none';
      rowAutoclose.style.display = 'none';
      sessionTitle.textContent = 'Gemini Nano (Local AI) Status';
      if (cloudApiConfig) cloudApiConfig.style.display = 'none';
      if (customApiConfigEl) customApiConfigEl.style.display = 'none';
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

  const DEFAULT_CUSTOM_INSTRUCTIONS = 'Keep output concise. No hashtags. No quotation marks. Be natural, authentic, and human.';
  const btnSaveInstructions = document.getElementById('btn-save-instructions');
  const btnResetInstructions = document.getElementById('btn-reset-instructions');

  // Max Length Preferences Handlers
  async function saveLengthSetting(key, rawValue) {
    const clamped = clampLengthValue(rawValue, 280);
    await chrome.storage.local.set({ [key]: clamped });
    if (key === 'maxReplyLength') {
      if (maxReplyLengthInput) maxReplyLengthInput.value = clamped;
      syncLengthPresetButtons(replyPresetBtns, clamped);
    } else {
      currentMaxPostLength = clamped;
      if (maxPostLengthInput) maxPostLengthInput.value = clamped;
      syncLengthPresetButtons(postPresetBtns, clamped);
      updateCharCount();
    }
    flashSaved();
  }

  let replyLenTimer = null;
  if (maxReplyLengthInput) {
    maxReplyLengthInput.addEventListener('input', () => {
      if (replyLenTimer) clearTimeout(replyLenTimer);
      replyLenTimer = setTimeout(() => saveLengthSetting('maxReplyLength', maxReplyLengthInput.value), 350);
    });
    maxReplyLengthInput.addEventListener('change', () => saveLengthSetting('maxReplyLength', maxReplyLengthInput.value));
  }

  let postLenTimer = null;
  if (maxPostLengthInput) {
    maxPostLengthInput.addEventListener('input', () => {
      if (postLenTimer) clearTimeout(postLenTimer);
      postLenTimer = setTimeout(() => saveLengthSetting('maxPostLength', maxPostLengthInput.value), 350);
    });
    maxPostLengthInput.addEventListener('change', () => saveLengthSetting('maxPostLength', maxPostLengthInput.value));
  }

  replyPresetBtns.forEach(btn => {
    btn.addEventListener('click', () => saveLengthSetting('maxReplyLength', btn.dataset.val));
  });

  postPresetBtns.forEach(btn => {
    btn.addEventListener('click', () => saveLengthSetting('maxPostLength', btn.dataset.val));
  });

  // Custom API Configuration Handlers
  let customApiSaveTimer = null;
  function scheduleCustomApiSave(refreshStatus = false) {
    if (customApiSaveTimer) clearTimeout(customApiSaveTimer);
    customApiSaveTimer = setTimeout(async () => {
      const cfg = readCustomApiForm();
      await chrome.storage.local.set({ customApi: cfg });
      flashSaved();
      if (refreshStatus) checkStatus();
    }, 400);
  }

  if (customApiPresetSelect) {
    customApiPresetSelect.addEventListener('change', async () => {
      const presetKey = customApiPresetSelect.value;
      const preset = CUSTOM_API_PRESETS[presetKey];
      if (preset && presetKey !== 'custom') {
        if (customApiFormatSelect) customApiFormatSelect.value = preset.format;
        if (customApiUrlInput) customApiUrlInput.value = preset.baseUrl;
        if (customApiModelInput) customApiModelInput.value = preset.model;
      }
      const cfg = readCustomApiForm();
      await chrome.storage.local.set({ customApi: cfg });
      flashSaved();
      checkStatus();
    });
  }

  if (customApiFormatSelect) {
    customApiFormatSelect.addEventListener('change', () => scheduleCustomApiSave(true));
  }
  if (customApiUrlInput) {
    customApiUrlInput.addEventListener('input', () => scheduleCustomApiSave(true));
  }
  if (customApiKeyInput) {
    customApiKeyInput.addEventListener('input', () => scheduleCustomApiSave(true));
  }
  if (customApiModelInput) {
    customApiModelInput.addEventListener('input', () => scheduleCustomApiSave(true));
  }
  if (customApiHeadersInput) {
    customApiHeadersInput.addEventListener('input', () => scheduleCustomApiSave(false));
  }

  if (btnToggleCustomKey && customApiKeyInput) {
    btnToggleCustomKey.addEventListener('click', () => {
      const isPassword = customApiKeyInput.type === 'password';
      customApiKeyInput.type = isPassword ? 'text' : 'password';
      btnToggleCustomKey.textContent = isPassword ? '🙈' : '👁️';
    });
  }

  if (btnFetchCustomModels) {
    btnFetchCustomModels.addEventListener('click', async () => {
      const cfg = readCustomApiForm();
      if (!cfg.baseUrl) {
        if (customApiStatus) {
          customApiStatus.className = 'cloud-status-text error';
          customApiStatus.textContent = 'Enter Base URL first.';
        }
        return;
      }

      btnFetchCustomModels.disabled = true;
      if (customApiStatus) {
        customApiStatus.className = 'cloud-status-text loading';
        customApiStatus.textContent = 'Fetching models...';
      }

      try {
        const granted = await requestCustomApiOriginPermission(cfg.baseUrl);
        if (!granted) {
          if (customApiStatus) {
            customApiStatus.className = 'cloud-status-text error';
            customApiStatus.textContent = 'Host permission declined.';
          }
          return;
        }
        await chrome.storage.local.set({ customApi: cfg });
        const resp = await new Promise((resolve) => {
          chrome.runtime.sendMessage({ type: 'FETCH_CUSTOM_API_MODELS', payload: cfg }, resolve);
        });
        if (resp?.success && Array.isArray(resp.models) && resp.models.length > 0) {
          if (customApiModelsDatalist) {
            customApiModelsDatalist.innerHTML = '';
            resp.models.forEach(modelId => {
              const opt = document.createElement('option');
              opt.value = modelId;
              customApiModelsDatalist.appendChild(opt);
            });
          }
          if (!cfg.model && customApiModelInput) {
            customApiModelInput.value = resp.models[0];
            await chrome.storage.local.set({ customApi: readCustomApiForm() });
          }
          if (customApiStatus) {
            customApiStatus.className = 'cloud-status-text success';
            customApiStatus.textContent = `✓ Loaded ${resp.models.length} models`;
          }
        } else {
          if (customApiStatus) {
            customApiStatus.className = 'cloud-status-text error';
            customApiStatus.textContent = resp?.message || 'No models returned.';
          }
        }
      } catch (err) {
        if (customApiStatus) {
          customApiStatus.className = 'cloud-status-text error';
          customApiStatus.textContent = `❌ ${err.message}`;
        }
      } finally {
        btnFetchCustomModels.disabled = false;
      }
    });
  }

  if (btnTestCustomApi) {
    btnTestCustomApi.addEventListener('click', async () => {
      const cfg = readCustomApiForm();
      if (!cfg.baseUrl || !cfg.model) {
        if (customApiStatus) {
          customApiStatus.className = 'cloud-status-text error';
          customApiStatus.textContent = 'Enter Endpoint URL and Model name.';
        }
        return;
      }

      btnTestCustomApi.disabled = true;
      if (customApiStatus) {
        customApiStatus.className = 'cloud-status-text loading';
        customApiStatus.textContent = 'Testing endpoint...';
      }

      try {
        const granted = await requestCustomApiOriginPermission(cfg.baseUrl);
        if (!granted) {
          if (customApiStatus) {
            customApiStatus.className = 'cloud-status-text error';
            customApiStatus.textContent = '❌ Origin permission denied.';
          }
          return;
        }

        await chrome.storage.local.set({ customApi: cfg });

        const resp = await new Promise((resolve) => {
          chrome.runtime.sendMessage({ type: 'VALIDATE_CUSTOM_API', payload: cfg }, resolve);
        });

        if (resp && resp.valid) {
          if (customApiStatus) {
            customApiStatus.className = 'cloud-status-text success';
            customApiStatus.textContent = resp.message || '✓ Connected!';
          }
          flashSaved();
          checkStatus();
        } else {
          if (customApiStatus) {
            customApiStatus.className = 'cloud-status-text error';
            customApiStatus.textContent = `❌ ${resp?.message || 'Connection failed.'}`;
          }
        }
      } catch (err) {
        if (customApiStatus) {
          customApiStatus.className = 'cloud-status-text error';
          customApiStatus.textContent = `❌ ${err.message}`;
        }
      } finally {
        btnTestCustomApi.disabled = false;
      }
    });
  }

  let saveTimer = null;
  customInstructionsEl.addEventListener('input', () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      await chrome.storage.local.set({ customInstructions: customInstructionsEl.value.trim() });
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

  // Cloud API Key auto-save on input with debounce
  let keySaveTimer = null;
  if (cloudApiKeyInput) {
    cloudApiKeyInput.addEventListener('input', () => {
      if (keySaveTimer) clearTimeout(keySaveTimer);
      keySaveTimer = setTimeout(async () => {
        const keyVal = cloudApiKeyInput.value.trim();
        await chrome.storage.local.set({ apiKey: keyVal });
        flashSaved();
        checkStatus();
      }, 500);
    });
  }

  // Cloud API Key visibility toggle
  if (btnToggleKeyVisibility && cloudApiKeyInput) {
    btnToggleKeyVisibility.addEventListener('click', () => {
      const isPassword = cloudApiKeyInput.type === 'password';
      cloudApiKeyInput.type = isPassword ? 'text' : 'password';
      btnToggleKeyVisibility.textContent = isPassword ? '🙈' : '👁️';
    });
  }

  // Cloud Model change
  if (cloudModelSelect) {
    cloudModelSelect.addEventListener('change', async () => {
      const selectedModel = cloudModelSelect.value;
      await chrome.storage.local.set({ cloudModel: selectedModel });
      flashSaved();
      checkStatus();
    });
  }

  // Verify Cloud API Key button
  if (btnTestCloudKey) {
    btnTestCloudKey.addEventListener('click', async () => {
      const keyVal = cloudApiKeyInput ? cloudApiKeyInput.value.trim() : '';
      const modelVal = cloudModelSelect ? cloudModelSelect.value : 'gemini-3.5-flash-lite';

      if (!keyVal) {
        if (cloudKeyStatus) {
          cloudKeyStatus.className = 'cloud-status-text error';
          cloudKeyStatus.textContent = 'Please enter an API key first.';
        }
        if (cloudApiKeyInput) cloudApiKeyInput.focus();
        return;
      }

      btnTestCloudKey.disabled = true;
      if (cloudKeyStatus) {
        cloudKeyStatus.className = 'cloud-status-text loading';
        cloudKeyStatus.textContent = 'Testing key...';
      }

      try {
        const resp = await new Promise((resolve) => {
          chrome.runtime.sendMessage({
            type: 'VALIDATE_CLOUD_API_KEY',
            payload: { apiKey: keyVal, model: modelVal }
          }, resolve);
        });

        if (resp && resp.valid) {
          if (cloudKeyStatus) {
            cloudKeyStatus.className = 'cloud-status-text success';
            cloudKeyStatus.textContent = resp.message || '✓ Valid & Ready!';
          }
          if (resp.model && !/gemma/i.test(resp.model) && cloudModelSelect) {
            let opt = Array.from(cloudModelSelect.options).find(o => o.value === resp.model);
            if (!opt) {
              opt = document.createElement('option');
              opt.value = resp.model;
              opt.textContent = `${resp.model} (Active)`;
              cloudModelSelect.appendChild(opt);
            }
            cloudModelSelect.value = resp.model;
          }
          const finalModel = (resp.model && !/gemma/i.test(resp.model))
            ? resp.model
            : (cloudModelSelect && !/gemma/i.test(cloudModelSelect.value) ? cloudModelSelect.value : 'gemini-3.5-flash-lite');

          await chrome.storage.local.set({
            apiKey: keyVal,
            cloudModel: finalModel,
            cloudApiVersion: resp.apiVersion || 'v1beta'
          });
          flashSaved();
          checkStatus();
        } else {
          if (cloudKeyStatus) {
            cloudKeyStatus.className = 'cloud-status-text error';
            cloudKeyStatus.textContent = `❌ ${resp?.message || 'Invalid API key.'}`;
          }
        }
      } catch (err) {
        if (cloudKeyStatus) {
          cloudKeyStatus.className = 'cloud-status-text error';
          cloudKeyStatus.textContent = `❌ Error: ${err.message}`;
        }
      } finally {
        btnTestCloudKey.disabled = false;
      }
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
      } else if (resp.statusText === 'Download Needed' || resp.statusText === 'Downloading') {
        statusBadge.className = 'status-badge warning';
        statusText.textContent = resp.statusText;
        sessionDesc.textContent = resp.message || 'Model download required in Chrome.';
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

  statusBadge.addEventListener('click', checkStatus);

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

// Test reply generation (strictly tests the selected engine without fallback)
  btnTest.addEventListener('click', async () => {
    const text = testInput.value.trim();
    if (!text) {
      testInput.focus();
      return;
    }

    const selectedRadio = document.querySelector('input[name="engine"]:checked');
    const selectedEngine = selectedRadio ? selectedRadio.value : 'cloud_api';

    btnTest.disabled = true;
    btnTest.textContent = 'Generating...';
    testOutput.style.display = 'block';
    testOutput.textContent = `Testing [${selectedEngine}] engine (fallback disabled for test)...`;

    try {
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({
          type: 'GENERATE_REPLY',
          payload: {
            tweetText: text,
            tweetAuthor: 'TestUser',
            tone: defaultToneSelect.value,
            engineOverride: selectedEngine,
            disableFallback: true
          }
        }, resolve);
      });

      if (response && response.success) {
        testOutput.textContent = '';
        const titleEl = document.createElement('strong');
        titleEl.textContent = `✦ [${response.engine || selectedEngine}] Reply:`;
        const brEl = document.createElement('br');
        const replyEl = document.createElement('span');
        replyEl.textContent = `"${response.reply}"`;
        testOutput.appendChild(titleEl);
        testOutput.appendChild(brEl);
        testOutput.appendChild(replyEl);
      } else {
        testOutput.textContent = `❌ [${selectedEngine}] Error: ${response?.message || response?.error || 'Failed to generate response.'}`;
      }
    } catch (err) {
      testOutput.textContent = `❌ [${selectedEngine}] Error: ${err.message}`;
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
    postCharCount.textContent = `${len} / ${currentMaxPostLength}`;
    if (len > currentMaxPostLength) {
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
        postOutputText.contentEditable = 'false';
        postOutputText.textContent = 'Crafting tweet with active AI engine...';
      }
      if (postOutputActions) postOutputActions.style.display = 'none';
      if (postCharCount) {
        postCharCount.classList.remove('over-limit');
        postCharCount.textContent = `... / ${currentMaxPostLength}`;
      }

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
            postOutputText.contentEditable = 'true';
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
          if (postCharCount) postCharCount.textContent = `0 / ${currentMaxPostLength}`;
        }
      } catch (err) {
        if (postOutputError) {
          postOutputError.style.display = 'block';
          postOutputError.textContent = `❌ Error: ${err.message}`;
        }
        if (postOutputText) postOutputText.style.display = 'none';
        if (postOutputActions) postOutputActions.style.display = 'none';
        if (postCharCount) postCharCount.textContent = `0 / ${currentMaxPostLength}`;
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

  // Open & Post directly on Twitter/X via official Web Intent
  if (btnOpenXPost) {
    btnOpenXPost.addEventListener('click', () => {
      if (!postOutputText) return;
      const text = postOutputText.innerText.trim();
      if (!text) return;
      const url = `https://x.com/intent/post?text=${encodeURIComponent(text)}`;
      chrome.tabs.create({ url });
    });
  }

  // Check Gemini Nano guide button
  const btnCheckNano = document.getElementById('btn-check-nano');
  if (btnCheckNano) {
    btnCheckNano.addEventListener('click', () => {
      chrome.tabs.create({
        url: 'https://github.com/gomedz/twitter-auto-reply#how-to-check-if-gemini-nano-is-supported-in-your-chrome'
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

  // Synchronize popup UI if settings change externally (e.g. via Floating HUD)
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.engine) {
      setEngineUI(changes.engine.newValue);
      checkStatus();
    }
    if (changes.defaultTone && defaultToneSelect) {
      defaultToneSelect.value = changes.defaultTone.newValue;
    }
    if (changes.defaultPostStyle && defaultPostStyleSelect) {
      defaultPostStyleSelect.value = changes.defaultPostStyle.newValue;
      if (postStyleSelect) postStyleSelect.value = changes.defaultPostStyle.newValue;
    }
    if (changes.customInstructions && customInstructionsEl && document.activeElement !== customInstructionsEl) {
      customInstructionsEl.value = changes.customInstructions.newValue || '';
    }
    if (changes.cloudModel && cloudModelSelect) {
      const nextModel = changes.cloudModel.newValue;
      if (nextModel && !Array.from(cloudModelSelect.options).some(o => o.value === nextModel)) {
        const opt = document.createElement('option');
        opt.value = nextModel;
        opt.textContent = `${nextModel} (Active)`;
        cloudModelSelect.appendChild(opt);
      }
      cloudModelSelect.value = nextModel;
    }
    if (changes.apiKey && cloudApiKeyInput && document.activeElement !== cloudApiKeyInput) {
      cloudApiKeyInput.value = changes.apiKey.newValue || '';
    }
    if (changes.showFloatingHud && floatingHudToggle) {
      floatingHudToggle.checked = changes.showFloatingHud.newValue !== false;
    }
    if (changes.autoCloseTab && autoCloseToggle) {
      autoCloseToggle.checked = changes.autoCloseTab.newValue !== false;
    }
    if (changes.maxReplyLength) {
      const nextReplyLen = clampLengthValue(changes.maxReplyLength.newValue, 280);
      if (maxReplyLengthInput && document.activeElement !== maxReplyLengthInput) {
        maxReplyLengthInput.value = nextReplyLen;
      }
      syncLengthPresetButtons(replyPresetBtns, nextReplyLen);
    }
    if (changes.maxPostLength) {
      const nextPostLen = clampLengthValue(changes.maxPostLength.newValue, 280);
      currentMaxPostLength = nextPostLen;
      if (maxPostLengthInput && document.activeElement !== maxPostLengthInput) {
        maxPostLengthInput.value = nextPostLen;
      }
      syncLengthPresetButtons(postPresetBtns, nextPostLen);
      updateCharCount();
    }
    if (changes.customApi && changes.customApi.newValue) {
      applyCustomApiFields(changes.customApi.newValue);
    }
  });

  // Initial status check
  checkStatus();
});