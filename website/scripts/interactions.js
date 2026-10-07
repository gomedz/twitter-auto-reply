/**
 * interactions.js
 * Handles scroll reveals, navigation effects, FAQ accordions, screenshot showcase tabs,
 * and global user micro-interactions.
 */

(function () {
  'use strict';

  /**
   * Global Toast Notification
   */
  window.showToast = function (message, duration = 3000) {
    let toast = document.getElementById('site-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'site-toast';
      toast.className = 'site-toast';
      document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.classList.add('show');

    if (window._toastTimeout) clearTimeout(window._toastTimeout);
    window._toastTimeout = setTimeout(() => {
      toast.classList.remove('show');
    }, duration);
  };

  /**
   * Navigation Bar Scroll Effect & Mobile Drawer
   */
  function initNavigation() {
    const navbar = document.querySelector('.navbar');
    const mobileToggle = document.querySelector('.nav-mobile-toggle');
    const mobileMenu = document.querySelector('.mobile-menu');

    // Sticky shadow & blur on scroll
    window.addEventListener('scroll', () => {
      if (window.scrollY > 24) {
        navbar?.classList.add('scrolled');
      } else {
        navbar?.classList.remove('scrolled');
      }
    }, { passive: true });

    // Mobile menu toggle
    if (mobileToggle && mobileMenu) {
      mobileToggle.addEventListener('click', () => {
        const isOpen = mobileMenu.classList.toggle('open');
        mobileToggle.setAttribute('aria-expanded', String(isOpen));
      });

      // Close mobile menu when clicking any nav link
      mobileMenu.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', () => {
          mobileMenu.classList.remove('open');
          mobileToggle.setAttribute('aria-expanded', 'false');
        });
      });
    }
  }

  /**
   * Scroll-Triggered Reveal Animations using IntersectionObserver
   */
  function initScrollReveals() {
    const revealElements = document.querySelectorAll('.reveal');
    if (!revealElements.length) return;

    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-revealed');
            obs.unobserve(entry.target);
          }
        });
      }, {
        root: null,
        rootMargin: '0px 0px 40px 0px',
        threshold: 0.05
      });

      revealElements.forEach(el => observer.observe(el));
    } else {
      // Fallback for older browsers
      revealElements.forEach(el => el.classList.add('is-revealed'));
    }
  }

  /**
   * Product Screenshot & Demo Showcase Tabs
   */
  function initShowcaseTabs() {
    const tabs = document.querySelectorAll('.showcase-tab-btn');
    const images = document.querySelectorAll('.showcase-image');

    if (!tabs.length || !images.length) return;

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const targetId = tab.getAttribute('data-target');

        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        images.forEach(img => {
          if (img.getAttribute('id') === targetId) {
            img.classList.add('active');
          } else {
            img.classList.remove('active');
          }
        });
      });
    });
  }

  /**
   * Accessible FAQ Accordion
   */
  function initFAQAccordion() {
    const faqItems = document.querySelectorAll('.faq-item');

    faqItems.forEach(item => {
      const summary = item.querySelector('.faq-trigger');
      if (!summary) return;

      summary.addEventListener('click', (e) => {
        // Optional: close other accordions for clean accordion style
        faqItems.forEach(otherItem => {
          if (otherItem !== item && otherItem.hasAttribute('open')) {
            otherItem.removeAttribute('open');
          }
        });
      });
    });
  }

  /**
   * Smooth Anchor Links with Offset
   */
  function initSmoothAnchors() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
      anchor.addEventListener('click', function (e) {
        const href = this.getAttribute('href');
        if (href === '#' || !href) return;

        const targetEl = document.querySelector(href);
        if (targetEl) {
          e.preventDefault();
          targetEl.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
          });
        }
      });
    });
  }

  // Export module
  window.Interactions = {
    init() {
      initNavigation();
      initScrollReveals();
      initShowcaseTabs();
      initFAQAccordion();
      initSmoothAnchors();
    }
  };
})();
