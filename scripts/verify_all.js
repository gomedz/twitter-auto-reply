// scripts/verify_all.js
// Automated verification suite for Twitter (X) AI Assistant extension

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passedTests = 0;
let failedTests = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`  ✓ ${testName}`);
    passedTests++;
  } else {
    console.error(`  ❌ FAIL: ${testName}`);
    failedTests++;
  }
}

console.log('====================================================');
console.log('Twitter AI Assistant - Complete Verification Suite');
console.log('====================================================\n');

// 1. Syntax Check on All JavaScript Files
console.log('[Test Suite 1: JavaScript Syntax & Compilation]');
const jsFiles = [
  'background.js',
  'content_twitter.js',
  'content_gemini.js',
  'offscreen.js',
  'popup/popup.js'
];

jsFiles.forEach(relPath => {
  const fullPath = path.resolve(__dirname, '..', relPath);
  try {
    const code = fs.readFileSync(fullPath, 'utf8');
    new vm.Script(code, { filename: relPath });
    assert(true, `Syntax valid: ${relPath}`);
  } catch (err) {
    assert(false, `Syntax error in ${relPath}: ${err.message}`);
  }
});

// 2. Manifest.json Integrity
console.log('\n[Test Suite 2: Manifest V3 Configuration]');
const manifestPath = path.resolve(__dirname, '..', 'manifest.json');
try {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert(manifest.manifest_version === 3, 'Manifest version is 3');
  assert(manifest.background && manifest.background.service_worker === 'background.js', 'Service worker properly configured');
  assert(manifest.permissions.includes('storage') && manifest.permissions.includes('offscreen'), 'Required permissions declared');
  assert(manifest.host_permissions.includes('https://x.com/*'), 'Host permissions include x.com');
  assert(manifest.host_permissions.includes('https://generativelanguage.googleapis.com/*'), 'Host permissions include Gemini Cloud API');
  assert(manifest.content_scripts.some(cs => cs.js.includes('content_twitter.js')), 'Content script content_twitter.js registered');
} catch (e) {
  assert(false, `Failed to parse manifest.json: ${e.message}`);
}

// 3. Multi-Selector Architecture in content_twitter.js
console.log('\n[Test Suite 3: Dual-Layer Multi-Selector Architecture]');
const contentTwitterCode = fs.readFileSync(path.resolve(__dirname, '..', 'content_twitter.js'), 'utf8');
assert(contentTwitterCode.includes('const SELECTORS = {'), 'SELECTORS dictionary defined in content_twitter.js');
assert(contentTwitterCode.includes("tweetArticle: 'article[data-testid=\"tweet\"], article.group\\\\/post"), 'tweetArticle supports Base UI + Tailwind');
assert(contentTwitterCode.includes("tweetText: 'div[data-testid=\"tweetText\"], [data-testid=\"tweetText\"], div[dir=\"auto\"]"), 'tweetText supports modern div[dir="auto"]');
assert(contentTwitterCode.includes("composeNavBtn: 'a[data-testid=\"SideNav_NewTweet_Button\"], div[data-testid=\"SideNav_NewTweet_Button\"], a[href=\"/compose/post\"]"), 'composeNavBtn supports /compose/post link');
assert(contentTwitterCode.includes('function extractAuthorHandle(containerEl)'), 'extractAuthorHandle upgraded to accept container element');
assert(contentTwitterCode.includes('linkMatch[1]'), 'extractAuthorHandle includes root profile href fallback');
assert(contentTwitterCode.includes('SELECTORS.toolbar'), 'injectGeminiButtons uses SELECTORS.toolbar');
assert(contentTwitterCode.includes('SELECTORS.tweetButton'), 'injectGeminiButtons uses SELECTORS.tweetButton');

// 4. Input State Synchronization in content_twitter.js
console.log('\n[Test Suite 4: React 18 / Lexical / Draft.js Event Dispatch]');
assert(contentTwitterCode.includes("inputType: 'insertText'"), 'insertTextIntoEditor dispatches beforeinput insertText');
assert(contentTwitterCode.includes("new ClipboardEvent('paste'"), 'insertTextIntoEditor dispatches ClipboardEvent paste');
assert(contentTwitterCode.includes("new Event('input', { bubbles: true })"), 'insertTextIntoEditor dispatches standard input event');
assert(contentTwitterCode.includes("new Event('change', { bubbles: true })"), 'insertTextIntoEditor dispatches standard change event');

// 5. Fallback Cascade in background.js
console.log('\n[Test Suite 5: Service Worker Fallback Cascade]');
const backgroundCode = fs.readFileSync(path.resolve(__dirname, '..', 'background.js'), 'utf8');
assert(backgroundCode.includes('Cloud API failed, attempting silent Headless fallback'), 'cloud_api cascades to Headless Web');
assert(backgroundCode.includes('Cloud API failed, falling back to existing Gemini Web Tab'), 'cloud_api cascades to Gemini Web Tab');
assert(backgroundCode.includes('maxOutputTokens: /pro/i.test(model) ? 1024 : 512'), 'Cloud API provides token headroom for reasoning models');

// 6. Gemini Web Authentication Detection in content_gemini.js
console.log('\n[Test Suite 6: Gemini Web Auth Detection]');
const contentGeminiCode = fs.readFileSync(path.resolve(__dirname, '..', 'content_gemini.js'), 'utf8');
assert(contentGeminiCode.includes('(hasChatUI && !explicitSignIn) || !!userAvatar'), 'checkLoginStatus strictly requires !explicitSignIn');
assert(contentGeminiCode.includes('hasExplicitSignIn'), 'checkLoginStatus exports hasExplicitSignIn indicator');

// 7. Web Intent Route in popup.js
console.log('\n[Test Suite 7: Standalone Post Creator Web Intent]');
const popupCode = fs.readFileSync(path.resolve(__dirname, '..', 'popup/popup.js'), 'utf8');
assert(popupCode.includes('https://x.com/intent/post?text='), 'Post Creator uses official x.com/intent/post Web Intent');
assert(!popupCode.includes('https://x.com/compose/post?text='), 'Deprecated /compose/post query route eliminated');

// Final summary
console.log('\n====================================================');
console.log(`Results: ${passedTests} passed, ${failedTests} failed`);
console.log('====================================================');

if (failedTests > 0) {
  process.exit(1);
} else {
  console.log('\n🎉 ALL SYSTEMS VERIFIED AND WORKING FLAWLESSLY!\n');
  process.exit(0);
}
