/**
 * mockup.js
 * Interactive Hero Tweet Card Controller
 * Provides realistic tone switching, simulated typing, context awareness,
 * and seamless interaction with the replica extension UI.
 */

(function () {
  'use strict';

  let currentTweetIndex = 0;
  let currentTone = 'quick';
  let isTyping = false;
  let typingTimeout = null;

  // Cache DOM elements
  const els = {
    // Tweet Card Elements
    avatar: document.getElementById('mockup-avatar'),
    authorName: document.getElementById('mockup-author-name'),
    authorHandle: document.getElementById('mockup-author-handle'),
    tweetTime: document.getElementById('mockup-tweet-time'),
    tweetText: document.getElementById('mockup-tweet-text'),
    statReplies: document.getElementById('mockup-stat-replies'),
    statReposts: document.getElementById('mockup-stat-reposts'),
    statLikes: document.getElementById('mockup-stat-likes'),
    statViews: document.getElementById('mockup-stat-views'),

    // Composer & Extension UI
    composerArea: document.getElementById('mockup-composer'),
    replyBox: document.getElementById('mockup-reply-text'),
    enginePill: document.getElementById('mockup-engine-pill'),
    toneChipsContainer: document.getElementById('mockup-tone-chips'),
    btnAIReply: document.getElementById('mockup-btn-ai-reply'),
    btnCopy: document.getElementById('mockup-btn-copy'),
    btnClear: document.getElementById('mockup-btn-clear'),
    btnPost: document.getElementById('mockup-btn-post'),
    topicTabs: document.querySelectorAll('.mockup-tab-btn')
  };

  /**
   * Initialize Mockup
   */
  function init() {
    if (!els.replyBox || !window.SAMPLE_TWEETS) return;

    renderTopicTabs();
    loadTweet(0);
    renderToneChips();
    bindEvents();

    // Trigger initial sample reply on page load with slight delay
    setTimeout(() => {
      simulateReplyGeneration('quick');
    }, 600);
  }

  /**
   * Render topic tabs listeners
   */
  function renderTopicTabs() {
    els.topicTabs.forEach((tab, index) => {
      tab.addEventListener('click', () => {
        if (isTyping) clearTimeout(typingTimeout);
        els.topicTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        loadTweet(index);
        simulateReplyGeneration(currentTone);
      });
    });
  }

  /**
   * Load tweet data into mockup card
   */
  function loadTweet(index) {
    currentTweetIndex = index;
    const tweet = window.SAMPLE_TWEETS[index];
    if (!tweet) return;

    if (els.avatar) {
      els.avatar.style.background = tweet.author.avatarColor;
      els.avatar.textContent = tweet.author.name.charAt(0);
    }
    if (els.authorName) els.authorName.textContent = tweet.author.name;
    if (els.authorHandle) els.authorHandle.textContent = tweet.author.handle;
    if (els.tweetTime) els.tweetTime.textContent = tweet.author.time;
    if (els.tweetText) els.tweetText.textContent = tweet.text;
    if (els.statReplies) els.statReplies.textContent = tweet.metrics.replies;
    if (els.statReposts) els.statReposts.textContent = tweet.metrics.reposts;
    if (els.statLikes) els.statLikes.textContent = tweet.metrics.likes;
    if (els.statViews) els.statViews.textContent = tweet.metrics.views;
    const replyTargetEl = document.getElementById('mockup-reply-target');
    if (replyTargetEl) replyTargetEl.textContent = tweet.author.handle;
  }

  /**
   * Render tone selector chips dynamically
   */
  function renderToneChips() {
    if (!els.toneChipsContainer || !window.TONE_DEFINITIONS) return;

    els.toneChipsContainer.innerHTML = '';
    window.TONE_DEFINITIONS.forEach(tone => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = `tone-chip-btn ${tone.id === currentTone ? 'active' : ''}`;
      chip.setAttribute('data-tone', tone.id);
      chip.innerHTML = `<span>${tone.icon}</span> <span>${tone.label}</span>`;
      chip.title = tone.description;

      chip.addEventListener('click', () => {
        if (isTyping) clearTimeout(typingTimeout);
        currentTone = tone.id;
        updateActiveToneChip(tone.id);
        simulateReplyGeneration(tone.id);
      });

      els.toneChipsContainer.appendChild(chip);
    });
  }

  /**
   * Update active class on tone chips
   */
  function updateActiveToneChip(toneId) {
    const chips = els.toneChipsContainer.querySelectorAll('.tone-chip-btn');
    chips.forEach(chip => {
      if (chip.getAttribute('data-tone') === toneId) {
        chip.classList.add('active');
      } else {
        chip.classList.remove('active');
      }
    });
  }

  /**
   * Simulate AI Reply generation with realistic typing effect
   */
  function simulateReplyGeneration(toneId) {
    const tweet = window.SAMPLE_TWEETS[currentTweetIndex];
    if (!tweet || !tweet.replies[toneId]) return;

    const replyText = tweet.replies[toneId];

    // Visual loading state
    if (els.composerArea) els.composerArea.classList.add('generating');
    if (els.enginePill) {
      els.enginePill.innerHTML = `
        <span class="radar-dot"></span>
        <span>⚡ Gemini Nano · 180ms · Local NPU</span>
      `;
    }

    els.replyBox.classList.remove('placeholder');
    els.replyBox.innerHTML = '<span class="typing-caret"></span>';
    isTyping = true;

    let charIdx = 0;
    const speed = 14; // ms per char

    function typeNextChar() {
      if (charIdx < replyText.length) {
        charIdx++;
        els.replyBox.innerHTML = escapeHtml(replyText.substring(0, charIdx)) + '<span class="typing-caret"></span>';
        typingTimeout = setTimeout(typeNextChar, speed);
      } else {
        // Finished typing
        isTyping = false;
        els.replyBox.innerHTML = escapeHtml(replyText);
        if (els.composerArea) els.composerArea.classList.remove('generating');
      }
    }

    // Small delay to simulate model latency
    typingTimeout = setTimeout(typeNextChar, 180);
  }

  /**
   * Escape HTML utility
   */
  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Bind interactive mockup buttons
   */
  function bindEvents() {
    // ✦ AI Reply button clicked
    if (els.btnAIReply) {
      els.btnAIReply.addEventListener('click', (e) => {
        e.preventDefault();
        simulateReplyGeneration(currentTone);
      });
    }

    // Copy Generated Reply
    if (els.btnCopy) {
      els.btnCopy.addEventListener('click', async () => {
        const text = els.replyBox.textContent.trim();
        if (!text || els.replyBox.classList.contains('placeholder')) {
          if (window.showToast) window.showToast('Please generate a reply first!');
          return;
        }

        try {
          await navigator.clipboard.writeText(text);
          if (window.showToast) {
            window.showToast('Copied to clipboard! 📋');
          }
        } catch (err) {
          // Fallback
          const textarea = document.createElement('textarea');
          textarea.value = text;
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand('copy');
          document.body.removeChild(textarea);
          if (window.showToast) window.showToast('Copied to clipboard! 📋');
        }
      });
    }

    // Clear reply
    if (els.btnClear) {
      els.btnClear.addEventListener('click', () => {
        if (isTyping) clearTimeout(typingTimeout);
        isTyping = false;
        els.replyBox.classList.add('placeholder');
        els.replyBox.textContent = 'Click "✦ AI Reply" or select a tone above to generate a context-aware response...';
        if (els.composerArea) els.composerArea.classList.remove('generating');
      });
    }

    // Simulated Post on X
    if (els.btnPost) {
      els.btnPost.addEventListener('click', () => {
        if (els.replyBox.classList.contains('placeholder')) {
          if (window.showToast) window.showToast('Select a tone to draft a reply first!');
          return;
        }
        if (window.showToast) {
          window.showToast('Simulated Reply successfully inserted into 𝕏 composer! 🚀');
        }
      });
    }
  }

  // Export to window
  window.MockupController = {
    init,
    simulateReplyGeneration
  };
})();
