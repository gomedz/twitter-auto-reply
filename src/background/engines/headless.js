// headless.js - Headless Gemini Web Fetch Engine (Google Cookie Session)

let cachedTokens = { at: null, fdr: null, bl: null, timestamp: 0 };

export async function getCachedSessionTokens() {
  if (cachedTokens.at && Date.now() - cachedTokens.timestamp < 300000) {
    return cachedTokens;
  }
  try {
    if (chrome.storage?.session) {
      const data = await chrome.storage.session.get('headlessTokens');
      if (data?.headlessTokens?.at && Date.now() - data.headlessTokens.timestamp < 300000) {
        cachedTokens = data.headlessTokens;
        return cachedTokens;
      }
    }
  } catch (e) {
    console.warn('[Background] chrome.storage.session read error:', e);
  }
  return null;
}

export async function setCachedSessionTokens(tokens) {
  cachedTokens = tokens;
  try {
    if (chrome.storage?.session) {
      await chrome.storage.session.set({ headlessTokens: tokens });
    }
  } catch (e) {
    console.warn('[Background] chrome.storage.session write error:', e);
  }
}

export async function getHeadlessSessionTokens() {
  const cached = await getCachedSessionTokens();
  if (cached) {
    return { ...cached, fromCache: true };
  }

  const res = await fetch('https://gemini.google.com/app', {
    credentials: 'include'
  });

  if (!res.ok) {
    throw new Error(`Failed to load Gemini page (HTTP ${res.status}). Ensure you are logged into Google.`);
  }

  const html = await res.text();

  const atMatch = html.match(/"SNlM0e"\s*:\s*"([^"]+)"/) || html.match(/\\"SNlM0e\\"\s*:\s*\\"([^\\"]+)\\"/);
  const fdrMatch = html.match(/"FdrFJe"\s*:\s*"([^"]+)"/) || html.match(/\\"FdrFJe\\"\s*:\s*\\"([^\\"]+)\\"/);
  const blMatch = html.match(/"cfb2h"\s*:\s*"([^"]+)"/) || html.match(/\\"cfb2h\\"\s*:\s*\\"([^\\"]+)\\"/);

  if (!atMatch || !atMatch[1]) {
    throw new Error('Google session token (SNlM0e) not found. Please ensure you are logged into gemini.google.com in Chrome.');
  }

  const tokens = {
    at: atMatch[1],
    fdr: fdrMatch ? fdrMatch[1] : '',
    bl: blMatch ? blMatch[1] : 'boq_assistant-bard-web-server_20261006.13_p0',
    timestamp: Date.now()
  };

  await setCachedSessionTokens(tokens);
  return { ...tokens, fromCache: false };
}

export async function clearCachedSessionTokens() {
  cachedTokens = { at: null, fdr: null, bl: null, timestamp: 0 };
  try {
    if (chrome.storage?.session) {
      await chrome.storage.session.remove('headlessTokens');
    }
  } catch (e) {
    console.warn('[Background] chrome.storage.session clear error:', e);
  }
}

export async function generateViaHeadless(promptText, retryCount = 0) {
  const tokens = await getHeadlessSessionTokens();

  // StreamGenerate expects an 80-slot inner array wrapped in [null, JSON.stringify(inner)]
  const inner = new Array(80).fill(null);
  inner[0] = [promptText, 0, null, null, null, null, 0];
  inner[1] = ["en"];
  inner[2] = ["", "", "", null, null, null, null, null, null, ""];

  const outer = [null, JSON.stringify(inner)];

  const bodyParams = new URLSearchParams();
  bodyParams.append('f.req', JSON.stringify(outer));
  if (tokens.at) {
    bodyParams.append('at', tokens.at);
  }

  const reqId = Math.floor(Math.random() * 900000) + 100000;
  const fSidParam = tokens.fdr ? `&f.sid=${encodeURIComponent(tokens.fdr)}` : '';
  const reqUrl = `https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate?bl=${encodeURIComponent(tokens.bl)}${fSidParam}&hl=en&_reqid=${reqId}&rt=c`;

  let response;
  try {
    response = await fetch(reqUrl, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'X-Same-Domain': '1',
        'x-goog-ext-73010989-jspb': '[0]'
      },
      body: bodyParams.toString(),
      signal: AbortSignal.timeout(30000)
    });
  } catch (netErr) {
    if (netErr.name === 'TimeoutError') {
      throw new Error('Headless Gemini request timed out after 30 seconds.');
    }
    throw netErr;
  }

  if (!response.ok) {
    if (response.status === 400 || response.status === 401 || response.status === 403) {
      await clearCachedSessionTokens();
      if (tokens.fromCache && retryCount < 1) {
        return await generateViaHeadless(promptText, retryCount + 1);
      }
    }
    throw new Error(`Headless Gemini request returned HTTP ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let rawText = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    rawText += decoder.decode(value, { stream: true });
  }
  rawText += decoder.decode();

  const candidate = extractHeadlessReplyText(rawText, promptText);

  if (!candidate) {
    await clearCachedSessionTokens();
    if (tokens.fromCache && retryCount < 1) {
      return await generateViaHeadless(promptText, retryCount + 1);
    }
    throw new Error('Could not parse text reply from headless stream. Ensure you are signed into gemini.google.com.');
  }

  return candidate;
}

export function collectWrbPayloads(node, out = []) {
  if (!Array.isArray(node)) return out;
  if (node[0] === 'wrb.fr' && typeof node[2] === 'string') {
    out.push(node[2]);
    return out;
  }
  for (const child of node) {
    if (Array.isArray(child)) {
      collectWrbPayloads(child, out);
    }
  }
  return out;
}

export function findCandidateByRc(node) {
  if (!node) return null;
  if (Array.isArray(node)) {
    if (typeof node[0] === 'string' && node[0].startsWith('rc_') && Array.isArray(node[1]) && typeof node[1][0] === 'string') {
      return node[1][0];
    }
    for (const child of node) {
      const res = findCandidateByRc(child);
      if (res) return res;
    }
  }
  return null;
}

export function extractHeadlessReplyText(rawText, promptText = '') {
  if (!rawText) return '';

  let latestStreamedReply = '';

  const lines = rawText.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('[') && !trimmed.startsWith('"[')) continue;

    try {
      const parsedEnvelope = JSON.parse(trimmed);
      const wrbPayloads = collectWrbPayloads(parsedEnvelope);
      for (const payloadStr of wrbPayloads) {
        try {
          const innerData = JSON.parse(payloadStr);
          if (innerData?.[4]?.[0]?.[1]?.[0] && typeof innerData[4][0][1][0] === 'string') {
            let str = innerData[4][0][1][0].trim();
            if (/<ElicitationsGroup/i.test(str)) {
              const beforeEl = str.split(/<ElicitationsGroup/i)[0].trim();
              if (beforeEl.length >= 10) str = beforeEl;
            }
            latestStreamedReply = str;
          } else {
            const rcCandidate = findCandidateByRc(innerData);
            if (rcCandidate) {
              let str = rcCandidate.trim();
              if (/<ElicitationsGroup/i.test(str)) {
                const beforeEl = str.split(/<ElicitationsGroup/i)[0].trim();
                if (beforeEl.length >= 10) str = beforeEl;
              }
              latestStreamedReply = str;
            }
          }
        } catch (innerErr) {}
      }
    } catch (e) {}
  }

  if (latestStreamedReply) return latestStreamedReply;

  // Strategy C: Regex search for rc_ pattern in rawText
  const rcMatches = [...rawText.matchAll(/\[\\?"rc_[^"]+\\?",\s*\[\\?"([^"\\]*(?:\\.[^"\\]*)*)\\?"/g)];
  if (rcMatches.length > 0) {
    const lastMatch = rcMatches[rcMatches.length - 1][1];
    try {
      return JSON.parse(`"${lastMatch}"`).trim();
    } catch (e) {
      return lastMatch.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\').trim();
    }
  }

  // Strategy D: Deep string harvesting (preferring valid tweet-length strings)
  const stringRegex = /"([^"\\]*(?:\\.[^"\\]*)*)"/g;
  let m;
  let bestTweetCandidate = '';
  let bestFallbackCandidate = '';
  let maxFallbackLen = 0;
  const promptSig = promptText.length > 30 ? promptText.substring(0, 30) : promptText;

  while ((m = stringRegex.exec(rawText)) !== null) {
    let unescaped = '';
    try {
      unescaped = JSON.parse(`"${m[1]}"`);
    } catch (e) {
      unescaped = m[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
    }

    const trimmedCandidate = unescaped.trim();
    if (
      trimmedCandidate.length >= 15 &&
      trimmedCandidate.length < 3000 &&
      !trimmedCandidate.startsWith('[') &&
      !trimmedCandidate.startsWith('{') &&
      !trimmedCandidate.startsWith('http') &&
      !trimmedCandidate.startsWith('boq_') &&
      !trimmedCandidate.startsWith('rc_') &&
      !trimmedCandidate.startsWith('c_') &&
      !trimmedCandidate.startsWith('r_') &&
      !trimmedCandidate.startsWith('<Elicitation') &&
      !trimmedCandidate.includes('BardFrontendService') &&
      !trimmedCandidate.includes('SNlM0e') &&
      !trimmedCandidate.includes('FdrFJe') &&
      !trimmedCandidate.includes('cfb2h') &&
      !trimmedCandidate.includes('assistant.lamda') &&
      !trimmedCandidate.includes('googleusercontent') &&
      !trimmedCandidate.includes('generic') &&
      !trimmedCandidate.includes('You are an authentic user') &&
      !trimmedCandidate.includes('You are crafting an authentic Twitter') &&
      (!promptSig || !trimmedCandidate.includes(promptSig)) &&
      /\s/.test(trimmedCandidate)
    ) {
      if (trimmedCandidate.length <= 280) {
        if (!bestTweetCandidate) {
          bestTweetCandidate = trimmedCandidate;
        }
      } else if (trimmedCandidate.length > maxFallbackLen) {
        maxFallbackLen = trimmedCandidate.length;
        bestFallbackCandidate = trimmedCandidate;
      }
    }
  }

  return (bestTweetCandidate || bestFallbackCandidate).trim();
}
