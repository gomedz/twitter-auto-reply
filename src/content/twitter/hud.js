// hud.js - Interactive Floating HUD Widget & Real-Time Storage Sync

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
