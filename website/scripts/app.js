/**
 * app.js
 * Main initialization script for 𝕏 Twitter AI Auto Reply landing page.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Initialize general UI interactions
  if (window.Interactions && typeof window.Interactions.init === 'function') {
    window.Interactions.init();
  }

  // Initialize interactive hero mockup
  if (window.MockupController && typeof window.MockupController.init === 'function') {
    window.MockupController.init();
  }

  console.log('🚀 [Twitter AI Auto Reply] Marketing site initialized successfully.');
});
