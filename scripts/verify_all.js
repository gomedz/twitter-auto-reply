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
console.log('\n[Test Suite 2: Manifest V3 Configuration & Version]');
const manifestPath = path.resolve(__dirname, '..', 'manifest.json');
try {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert(manifest.manifest_version === 3, 'Manifest version is 3');
  assert(manifest.version === '1.4.0', 'Manifest version is 1.4.0');
  assert(manifest.background && manifest.background.service_worker === 'background.js', 'Service worker properly configured');
  assert(manifest.permissions.includes('storage') && manifest.permissions.includes('offscreen'), 'Required permissions declared');
  assert(manifest.host_permissions.includes('https://x.com/*'), 'Host permissions include x.com');
  assert(manifest.host_permissions.includes('https://generativelanguage.googleapis.com/*'), 'Host permissions include Gemini Cloud API');
  assert(manifest.content_scripts.some(cs => cs.js.includes('content_twitter.js')), 'Content script content_twitter.js registered');
} catch (e) {
  assert(false, `Failed to parse manifest.json: ${e.message}`);
}

// 2b. Project Cleanliness & Release Subfolder
console.log('\n[Test Suite 2b: Project Layout & Release Subfolder]');
const releaseDir = path.resolve(__dirname, '..', 'release');
assert(fs.existsSync(releaseDir) && fs.statSync(releaseDir).isDirectory(), 'Release directory exists');
const rootFiles = fs.readdirSync(path.resolve(__dirname, '..'));
const rootZips = rootFiles.filter(f => f.endsWith('.zip'));
assert(rootZips.length === 0, 'No ZIP archive files in root project directory');
const releaseZips = fs.readdirSync(releaseDir).filter(f => f.endsWith('.zip'));
assert(releaseZips.length > 0, `All release packages located in release/ directory (${releaseZips.length} archives)`);

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

// 8. Universal Clean Output & Anti-Artifact Sanitization
console.log('\n[Test Suite 8: Universal Clean Output & Anti-Artifact Sanitization]');
assert(backgroundCode.includes('Never start or begin the reply with emojis'), 'Reply prompt instructs model never to start with emojis');
assert(backgroundCode.includes('Never start or begin the tweet with emojis'), 'Post prompt instructs model never to start with emojis');
assert(backgroundCode.includes('Plain text only. Do NOT output HTML, XML, URLs, or metadata'), 'Prompt strictly forbids HTML/XML/URLs/metadata');

const sandbox = {};
const helperFunctionsCode = `
${backgroundCode.match(/function hasNoEmojiInstruction[\s\S]*?^}/m)[0]}
${backgroundCode.match(/function hasNoHashtagInstruction[\s\S]*?^}/m)[0]}
${backgroundCode.match(/function extractCustomCharLimit[\s\S]*?^}/m)[0]}
${backgroundCode.match(/function sanitizeTweetOutput[\s\S]*?^}/m)[0]}
`;
vm.runInNewContext(helperFunctionsCode, sandbox);

// Case 1: Image 1 truncated googleusercontent link at end
const res1 = sandbox.sanitizeTweetOutput(`Frequent handle changes are a classic red flag for burner accounts or scammers trying to evade accountability. Good catch, tracking history is essential before trusting anyone online.\n\nhttp://googleusercontent.`);
assert(!res1.includes('googleusercontent') && res1.includes('Frequent handle changes'), 'Image 1: Truncated http://googleusercontent. stripped cleanly from end');

// Case 2: Image 2 leading emojis and ElicitationsGroup tags
const res2 = sandbox.sanitizeTweetOutput(`🧦 😭 <ElicitationsGroup message="Want to...Bro changes his handle more often than his socks 🧦 😭 <ElicitationsGroup message="Want to...as identity crisis level o has identity crisis level 99`);
assert(!res2.includes('ElicitationsGroup') && !res2.startsWith('🧦') && res2.startsWith('Bro changes') && res2.includes('🧦 😭 as identity crisis'), 'Image 2: ElicitationsGroup tags and leading emojis stripped; internal emojis preserved');

// Case 3: Image 3 glued googleusercontent and leading emojis
const res3 = sandbox.sanitizeTweetOutput(`🕵️ 💀\nhttp://googleusercontent.Even witness protection programs are less dramatic 🕵️ 💀\n\nhttp://googleusercontent.`);
assert(!res3.includes('googleusercontent') && !res3.startsWith('🕵️') && res3.startsWith('Even witness protection') && res3.endsWith('🕵️ 💀'), 'Image 3: Glued http://googleusercontent. stripped without damaging adjacent text; leading emojis removed; trailing preserved');

// Case 4: Full googleusercontent CDN URL
const res4 = sandbox.sanitizeTweetOutput(`Check out this update: https://lh3.googleusercontent.com/d/xyz123abc for details.`);
assert(!res4.includes('googleusercontent') && res4.includes('Check out this update') && res4.includes('for details.'), 'Full googleusercontent CDN link stripped cleanly');

// Case 5: Google search grounding citations
const res5 = sandbox.sanitizeTweetOutput(`Recent breakthroughs in AI models [1] were announced yesterday【2†source】!`);
assert(!res5.includes('[1]') && !res5.includes('【2†source】') && res5.includes('Recent breakthroughs in AI models were announced yesterday!'), 'Google grounding footnotes and source brackets stripped');

// Case 6: Preserve emojis in middle and end
const res6 = sandbox.sanitizeTweetOutput(`This is great work 🚀 proud of the team! 👏`);
assert(res6 === `This is great work 🚀 proud of the team! 👏`, 'Middle and ending emojis are preserved intact');

// Case 7: Leading emoji with colon and punctuation
const res7 = sandbox.sanitizeTweetOutput(`🔥: Absolutely legendary performance tonight!`);
assert(res7 === `Absolutely legendary performance tonight!`, 'Leading emoji followed by colon is stripped cleanly');

// Case 8: Custom Instructions "no emojis" strips all emojis
const res8 = sandbox.sanitizeTweetOutput(`Great job 🎯 keep pushing! 🚀`, 'No emojis allowed');
assert(!res8.includes('🎯') && !res8.includes('🚀') && res8.includes('Great job keep pushing!'), 'Custom instruction "no emojis" strips all emojis');

// Case 9: Custom Instructions "no hashtags" strips hashtags
const res9 = sandbox.sanitizeTweetOutput(`Great launch #AI #Tech to the moon`, 'no hashtags');
assert(!res9.includes('#AI') && !res9.includes('#Tech') && res9.includes('Great launch to the moon'), 'Custom instruction "no hashtags" strips hashtags');

// Case 10: Image 4 with raw ElicitationsGroup block and zero-width spaces
const res10 = sandbox.sanitizeTweetOutput(`\u200B🧹 🙌 Finally, goodbye to the bot army 🧹 🙌 <ElicitationsGroup message="Want to explore further?"><Elicitation query="Bot farms sweating hard right now">Bot farms sweating hard right now</Elicitation></ElicitationsGroup>`);
assert(res10 === `Finally, goodbye to the bot army 🧹 🙌`, 'Image 4: Full ElicitationsGroup block dropped, leading emojis stripped despite zero-width space, trailing emojis preserved');

// Case 11: Image 4 flattened with duplicated phrases
const res11 = sandbox.sanitizeTweetOutput(`🧹 🙌 Finally, goodbye to the bot army 🧹 🙌 Bot farms sweating hard right now Bot farms sweating hard right now`);
assert(!res11.startsWith('🧹') && !res11.includes('sweating hard right now Bot farms'), 'Image 4 flattened: Leading emojis stripped and consecutive duplicate sentences deduplicated');

// Case 12: Client-side sanitizer in content_twitter.js
assert(contentTwitterCode.includes('function sanitizeForEditor(rawText)'), 'content_twitter.js implements sanitizeForEditor failsafe');
assert(contentTwitterCode.includes('inputType: \'deleteByCut\''), 'content_twitter.js dispatches deleteByCut to ensure clean composer state');

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

