/**
 * Twitter AI Auto Reply — Product Website Scripts
 */

document.addEventListener('DOMContentLoaded', () => {
  // -------------------------------------------------------------
  // 1. Toast Notification Utility
  // -------------------------------------------------------------
  const toast = document.getElementById('toast');
  let toastTimer = null;

  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, 2500);
  }

  // -------------------------------------------------------------
  // 2. Interactive Live Reply Generator Demo
  // -------------------------------------------------------------
  const demoTweetInput = document.getElementById('demo-tweet');
  const presetPills = document.querySelectorAll('.preset-pill');
  const toneButtons = document.querySelectorAll('.tone-btn');
  const btnDemoGenerate = document.getElementById('btn-demo-generate');
  const demoPlaceholder = document.getElementById('demo-placeholder');
  const demoOutput = document.getElementById('demo-output');
  const demoTypedText = document.getElementById('demo-typed-text');
  const charCount = document.getElementById('char-count');
  const btnCopyDemo = document.getElementById('btn-copy-demo');

  let currentTone = 'thoughtful';
  let isTyping = false;
  let typingInterval = null;

  // Canned responses mapped by tone for demonstration
  const sampleResponses = {
    thoughtful: [
      "The shift to local on-device models like Gemini Nano fundamentally reshapes the latency vs. privacy tradeoff. Running inference right on user hardware solves compliance bottlenecks that cloud APIs could never fix.",
      "Completely agree that taste and architecture remain the core differentiator. AI gives everyone senior-level typing speed, but deciding WHAT to build and WHY is still a distinctly human skill.",
      "Consistency over intensity. Starting with just a 15-minute daily review block compounded far more over 6 months than any full-weekend overhaul ever did."
    ],
    quick: [
      "100% on point. Taste is the new moat.",
      "Huge milestone! Checking it out now 🙌",
      "Time-blocking my morning focus hours. Total game changer."
    ],
    agree: [
      "Could not agree more! AI handles the syntax, but human discernment dictates the trajectory of the entire codebase.",
      "Major congratulations! Launching an open-source project after months of heads-down work is a huge feat. Will definitely star and star the repo!",
      "Spot on. Building tiny friction-free habits is the only sustainable way to scale output."
    ],
    funny: [
      "AI is great at writing 500 lines of code in 2 seconds... and then spending 4 hours convincing you why it invented a new JavaScript framework.",
      "6 months of 'it will only take one weekend' culminated in this glory! Congrats on escaping tutorial purgatory 🚀",
      "Drinking enough coffee to legally qualify as a barista. It keeps the commit graph green."
    ],
    question: [
      "Great point. Do you think we'll see specialized 'taste and architecture' benchmarks emerge to evaluate how AI handles high-level system design?",
      "Congrats on the launch! What was the hardest architectural challenge your team hit while preparing this for release?",
      "Did you use any habit tracking app, or did you stick strictly to analog journaling/calendar blocks?"
    ],
    debate: [
      "While taste matters, AI is rapidly developing internal heuristics for code smells and architectural anti-patterns. The boundary between 'syntax' and 'judgment' is blurring faster than people expect.",
      "Open source is only 10% building and 90% issue triage. Be prepared for the flood of 'can you add X feature by tomorrow' issues!",
      "I actually found micro-habits less effective than intense seasonal sprints. Some complex problems require sustained immersion rather than 15-minute bites."
    ]
  };

  // Preset tweet selection
  presetPills.forEach((pill) => {
    pill.addEventListener('click', () => {
      presetPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      demoTweetInput.value = pill.getAttribute('data-text');
    });
  });

  // Default initial preset
  if (presetPills.length > 0) {
    demoTweetInput.value = presetPills[0].getAttribute('data-text');
  }

  // Tone buttons selection
  toneButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      toneButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTone = btn.getAttribute('data-tone') || 'thoughtful';
    });
  });

  // Typewriter effect generator
  function typeWriter(text) {
    if (isTyping) clearInterval(typingInterval);
    isTyping = true;
    demoTypedText.textContent = '';
    demoPlaceholder.style.display = 'none';
    demoOutput.style.display = 'block';
    btnCopyDemo.style.display = 'none';

    let index = 0;
    typingInterval = setInterval(() => {
      if (index < text.length) {
        demoTypedText.textContent += text.charAt(index);
        charCount.textContent = `${demoTypedText.textContent.length} / 280 characters`;
        index++;
      } else {
        clearInterval(typingInterval);
        isTyping = false;
        btnCopyDemo.style.display = 'inline-flex';
        btnDemoGenerate.disabled = false;
        btnDemoGenerate.innerHTML = '<span>✦ Generate AI Reply</span>';
      }
    }, 18);
  }

  // Trigger Demo Generation
  btnDemoGenerate.addEventListener('click', () => {
    const inputVal = demoTweetInput.value.trim();
    if (!inputVal) {
      demoTweetInput.focus();
      return;
    }

    btnDemoGenerate.disabled = true;
    btnDemoGenerate.innerHTML = '<span>✦ Generating Reply...</span>';

    // Pick a response based on tone and input text hash
    const pool = sampleResponses[currentTone] || sampleResponses.thoughtful;
    const chosenIndex = Math.abs(inputVal.length) % pool.length;
    const responseText = pool[chosenIndex];

    setTimeout(() => {
      typeWriter(responseText);
    }, 350);
  });

  // Copy Demo Reply Button
  if (btnCopyDemo) {
    btnCopyDemo.addEventListener('click', async () => {
      const text = demoTypedText.textContent.trim();
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        showToast('✓ Reply copied to clipboard!');
      } catch (err) {
        console.error('Clipboard copy error:', err);
      }
    });
  }

  // -------------------------------------------------------------
  // 3. FAQ Accordion
  // -------------------------------------------------------------
  const accordionHeaders = document.querySelectorAll('.accordion-header');
  accordionHeaders.forEach(header => {
    header.addEventListener('click', () => {
      const item = header.parentElement;
      const isOpen = item.classList.contains('active');
      
      // Close other accordion items
      document.querySelectorAll('.accordion-item').forEach(other => {
        if (other !== item) other.classList.remove('active');
      });

      // Toggle current
      item.classList.toggle('active', !isOpen);
    });
  });

  // -------------------------------------------------------------
  // 4. Code & Crypto Clipboard Copy Buttons
  // -------------------------------------------------------------
  const copyCodeBtns = document.querySelectorAll('.btn-copy-code');
  copyCodeBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      const code = btn.getAttribute('data-code');
      if (!code) return;
      try {
        await navigator.clipboard.writeText(code);
        const originalText = btn.textContent;
        btn.textContent = 'Copied!';
        showToast('✓ Command copied to clipboard!');
        setTimeout(() => {
          btn.textContent = originalText;
        }, 2000);
      } catch (err) {
        console.error('Copy failed', err);
      }
    });
  });

  const btnCopyCryptoWeb = document.getElementById('btn-copy-crypto-web');
  const webCryptoVal = document.getElementById('web-crypto-val');
  if (btnCopyCryptoWeb && webCryptoVal) {
    btnCopyCryptoWeb.addEventListener('click', async () => {
      const address = webCryptoVal.textContent.trim();
      try {
        await navigator.clipboard.writeText(address);
        const originalText = btnCopyCryptoWeb.textContent;
        btnCopyCryptoWeb.textContent = 'Copied!';
        showToast('✓ Crypto address copied to clipboard!');
        setTimeout(() => {
          btnCopyCryptoWeb.textContent = originalText;
        }, 2000);
      } catch (err) {
        console.error('Copy failed', err);
      }
    });
  }

  // -------------------------------------------------------------
  // 5. Header Nav Scroll Effect
  // -------------------------------------------------------------
  const header = document.getElementById('header');
  window.addEventListener('scroll', () => {
    if (window.scrollY > 30) {
      header.style.borderBottomColor = 'rgba(255, 255, 255, 0.12)';
      header.style.background = 'rgba(7, 9, 14, 0.9)';
    } else {
      header.style.borderBottomColor = 'rgba(255, 255, 255, 0.08)';
      header.style.background = 'rgba(7, 9, 14, 0.75)';
    }
  });
});
