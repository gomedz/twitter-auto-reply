// prompts.js - Prompt Builders, Length Resolution & Output Sanitizers

export function hasNoEmojiInstruction(instructions) {
  if (!instructions) return false;
  return /(?:no|zero|without|avoid|don'?t\s+use|do\s+not\s+use|never\s+use|free\s+of|stop\s+using|disallow)\s+emojis?/i.test(instructions);
}

export function hasNoHashtagInstruction(instructions) {
  if (!instructions) return false;
  return /(?:no|zero|without|avoid|don'?t\s+use|do\s+not\s+use|never\s+use|free\s+of|stop\s+using|disallow)\s+hashtags?/i.test(instructions);
}

export function extractCustomCharLimit(instructions, defaultLimit = 260) {
  if (!instructions) return defaultLimit;
  const match = instructions.match(/(?:under|max|less than|within|limit to)\s*(\d{2,4})\s*(?:chars|characters)/i);
  if (match) {
    const parsed = parseInt(match[1], 10);
    if (!isNaN(parsed) && parsed >= 20 && parsed <= 4000) {
      return parsed;
    }
  }
  return defaultLimit;
}

export function resolveEffectiveMaxLength(configuredLimit, customInstructions = '', fallbackDefault = 280) {
  if (configuredLimit !== null && configuredLimit !== undefined && configuredLimit !== '') {
    const parsed = parseInt(configuredLimit, 10);
    if (!isNaN(parsed)) {
      return Math.min(4000, Math.max(20, parsed));
    }
  }
  return extractCustomCharLimit(customInstructions, fallbackDefault);
}

export function stripConflictingLengthClause(instructions, hasExplicitLimit = false) {
  if (!instructions || !hasExplicitLimit) return instructions || '';
  return instructions
    .replace(/,?\s*(?:under|max|less than|within|limit to)\s*\d{2,4}\s*(?:chars|characters)\.?\s*/gi, '. ')
    .replace(/\.\s*\./g, '.')
    .replace(/\s{2,}/g, ' ')
    .replace(/^\s*[,;.]+\s*/, '')
    .trim();
}

export function computeOutputTokenBudget(effectiveLimit = 280, isReasoningModel = false) {
  const baseTokens = Math.ceil(Math.max(20, effectiveLimit) / 2.5) + 128;
  return Math.min(4096, Math.max(512, baseTokens + (isReasoningModel ? 512 : 0)));
}

export function buildGeminiPrompt({ tweetText, tweetAuthor, tone, customInstructions, maxLength = null }) {
  const toneDescriptions = {
    quick: 'natural, friendly, and relevant',
    agree: 'supportive, validating, and constructive',
    thoughtful: 'intellectual, thoughtful, adding valuable perspective',
    funny: 'witty, humorous, and clever with a lighthearted touch',
    question: 'asking an engaging, open-ended question to spark conversation',
    debate: 'respectfully offering an alternate viewpoint or counter-argument'
  };

  const selectedTone = toneDescriptions[tone] || toneDescriptions.quick;
  const authorMention = tweetAuthor ? ` by @${tweetAuthor}` : '';
  const noEmoji = hasNoEmojiInstruction(customInstructions);
  const noHashtags = hasNoHashtagInstruction(customInstructions);
  const charLimit = resolveEffectiveMaxLength(maxLength, customInstructions, 260);
  const promptRules = stripConflictingLengthClause(customInstructions, maxLength !== null && maxLength !== undefined);

  const customBlock = promptRules
    ? `MANDATORY USER RULES — HIGHEST PRIORITY — OVERRIDE EVERYTHING ELSE:\n${promptRules}\n\n`
    : '';

  const bottomReminder = promptRules
    ? `\nREMINDER — USER RULES STILL APPLY AND CANNOT BE IGNORED:\n${promptRules}\n`
    : '';

  return `${customBlock}You are an authentic user on Twitter (X). Write a ${selectedTone} reply to this tweet${authorMention}:
"""
${tweetText}
"""

Requirements:
- Single direct reply only, strictly under ${charLimit} characters.${charLimit > 280 ? ' Long-form reply allowed; use clean line breaks if helpful.' : ''}
- Conversational and human.
- No quotation marks.
- No conversational preamble.
- Never start or begin the reply with emojis or emoticons. If emojis are used, place them naturally within or at the end of the sentence.
- Plain text only. Do NOT output HTML, XML, URLs, or metadata.
${promptRules ? '- Custom Rules override selected Tone and general Requirements (except the max character limit above).\n' : ''}${noEmoji ? '- No emojis.\n' : ''}${noHashtags ? '- No hashtags.\n' : ''}${bottomReminder}
Reply:`;
}

export function sanitizeTweetOutput(text, customInstructions = '', maxLength = null) {
  if (!text) return '';
  let cleaned = text.trim();

  // 1. Strip invisible control characters, zero-width spaces, BOM, RTL/LTR marks, soft hyphens
  cleaned = cleaned.replace(/[\u200B-\u200F\uFEFF\u2060\u00AD]/g, '').trim();

  // 2. Remove conversational preamble labels
  cleaned = cleaned.replace(/^(?:sure(?: thing)?[!,.]?\s*)?(?:here(?:'s| is) (?:a |the )?(?:suggested |quick |twitter |witty )?(?:reply|tweet|post):?\s*|twitter (?:reply|post):?\s*|suggested (?:reply|post):?\s*|(?:reply|tweet):?\s*)/i, '').trim();

  // 3. Handle Google Web UI / Elicitations blocks
  if (/<ElicitationsGroup\b[\s\S]*?<\/ElicitationsGroup>/i.test(cleaned)) {
    const beforeBlock = cleaned.split(/<ElicitationsGroup/i)[0].trim();
    if (beforeBlock.replace(/^[\p{Extended_Pictographic}\s]+/u, '').length >= 10) {
      cleaned = beforeBlock;
    } else {
      const elicitationMatch = cleaned.match(/<Elicitation[^>]*query="([^"]+)"/i) ||
                               cleaned.match(/<Elicitation[^>]*>([^<]+)<\/Elicitation>/i);
      if (elicitationMatch && elicitationMatch[1]) {
        cleaned = elicitationMatch[1].trim();
      }
    }
  }

  // 4. Strip closed ElicitationsGroup blocks or unclosed elicitation/HTML tags
  cleaned = cleaned.replace(/<ElicitationsGroup\b[\s\S]*?<\/ElicitationsGroup>/gi, ' ');
  cleaned = cleaned.replace(/<\/?(?:thought|think|scratchpad|annotation|search-result)[^>]*>[\s\S]*?<\/(?:thought|think|scratchpad|annotation|search-result)>/gi, ' ');
  cleaned = cleaned.replace(/<\/?Elicitation(?:sGroup)?[^>]*>/gi, ' ');
  cleaned = cleaned.replace(/<ElicitationsGroup\b(?:\s+message="[^"\n]{1,40}(?:\.{2,3}|…|"))?>?/gi, ' ');
  cleaned = cleaned.replace(/<Elicitation\b[^>]*>/gi, ' ');
  cleaned = cleaned.replace(/<\/?(?:thought|think|scratchpad|annotation|search-result|p|div|span|br|a|b|i|em|strong|code|pre|ul|ol|li|blockquote|h[1-6])(?:\s+[a-zA-Z_:][a-zA-Z0-9_.:-]*\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))*\s*\/?>/gi, ' ');

  // 5. Strip Google CDN, googleusercontent, and internal search grounding links
  cleaned = cleaned
    .replace(/https?:\/\/(?:[a-zA-Z0-9-]+\.)*googleusercontent(?:\.(?:com|org|net)(?:\/[^\s]*)?|\.(?=[A-Z\s]|$)|(?=[\s]|$))/gi, '')
    .replace(/https?:\/\/(?:www\.)?google\.com\/(?:search|url|aclk)\S*/gi, '');

  // 6. Strip Grounding / Citation Footnotes
  cleaned = cleaned
    .replace(/\[\d+\]/g, '')
    .replace(/【\d+†[^】]*】/g, '')
    .replace(/\^\[\d+\]/g, '')
    .replace(/\[citation:\d+\]/gi, '');

  // 7. Strip consecutive duplicated sentences or long phrases
  cleaned = cleaned.replace(/\b(.{10,120}?)\s+\1\b/gi, '$1');

  // 8. Unquote wrapping quotes
  if ((cleaned.startsWith('"') && cleaned.endsWith('"')) || (cleaned.startsWith('“') && cleaned.endsWith('”')) || (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
    cleaned = cleaned.slice(1, -1).trim();
  }

  // 9. Strip leading/trailing asterisks
  cleaned = cleaned.replace(/^\*+\s*/, '').replace(/\s*\*+$/, '').trim();

  // 10. Enforce "Never add emoji at the beginning" rule
  const emojiPrefix = /^(?:[\p{Extended_Pictographic}\uFE0E\uFE0F\u200D\u20E3]|\uD83C[\uDDE6-\uDDFF]|\uD83C[\uDFFB-\uDFFF])+/u;
  let loopCount = 0;
  while (loopCount < 10 && emojiPrefix.test(cleaned)) {
    const prev = cleaned;
    cleaned = cleaned.replace(emojiPrefix, '').trim();
    cleaned = cleaned.replace(/^[:\-–—|,!.\s]+/, '').trim();
    if (cleaned === prev) break;
    loopCount++;
  }

  // 11. Normalise whitespace & line breaks
  cleaned = cleaned
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // 12. If user requested NO emojis anywhere
  if (hasNoEmojiInstruction(customInstructions)) {
    cleaned = cleaned
      .replace(/[\p{Extended_Pictographic}\uFE00-\uFE0F]/ug, '')
      .replace(/[ \t]+([,.!?])/g, '$1')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
  }

  // 13. If user requested NO hashtags
  if (hasNoHashtagInstruction(customInstructions)) {
    cleaned = cleaned
      .replace(/#[A-Za-z0-9_]+/g, '')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
  }

  // 14. Length trimming according to explicit maxLength or custom instruction limit
  const maxLimit = resolveEffectiveMaxLength(maxLength, customInstructions, 280);

  if (cleaned.length > maxLimit) {
    const cut = cleaned.substring(0, Math.max(10, maxLimit - 5));
    const minThreshold = Math.min(60, Math.floor(maxLimit * 0.4));
    const lastPunct = Math.max(cut.lastIndexOf('.'), cut.lastIndexOf('!'), cut.lastIndexOf('?'));
    if (lastPunct > minThreshold) {
      cleaned = cut.substring(0, lastPunct + 1).trim();
    } else {
      const lastSpace = Math.max(cut.lastIndexOf(' '), cut.lastIndexOf('\n'));
      cleaned = (lastSpace > minThreshold ? cut.substring(0, lastSpace).trim() : cut) + '...';
    }
  }

  return cleaned;
}

export function cleanGeneratedReply(rawText, customInstructions = '', mode = 'reply', maxLength = null) {
  if (!rawText) return '';
  let text = rawText.trim();

  const hasExplicitScratchpadLabels = /(?:\*+\s*(?:User wants|Original [Tt]weet|Target|Constraints|Tone|Topic|Goal|Category|Platform|Persona|Witty angles|Analyzing|Evaluating|Draft|Thinking|Thought)|Option\s*\d|\*+Option\s*\d)/i.test(text);
  const hasLongBulletScratchpad = text.length > 280 && (text.split('\n').filter(l => /^\s*[*•-]/.test(l)).length >= 2);
  const hasScratchpad = hasExplicitScratchpadLabels || hasLongBulletScratchpad;

  if (hasScratchpad) {
    const optionMatches = [...text.matchAll(/(?:^|[\n*•-])\s*\*?\*?Option\s*(\d)\*?:\*?\s*([^\n*]+)/gi)];
    if (optionMatches.length > 0) {
      const praisedMatch = text.match(/Option\s*(\d)[^.\n]*(?:Twitter|best|clever|witty|classic|favorite)/i);
      let chosen = optionMatches[0];
      if (praisedMatch) {
        const found = optionMatches.find(m => m[1] === praisedMatch[1]);
        if (found) chosen = found;
      }
      let candidate = chosen[2].trim().replace(/^["'“]|["'”]$/g, '').trim();
      if (candidate.length >= 10) {
        return sanitizeTweetOutput(candidate, customInstructions, maxLength);
      }
    }

    const bulletQuotes = [...text.matchAll(/(?:^|[\n*•-])\s*["“]([^"”\n]{15,260})["”]/g)];
    if (bulletQuotes.length > 0) {
      const validQuotes = bulletQuotes.filter(q => {
        const t = q[1].trim();
        return !t.toLowerCase().includes('original tweet') && t.length >= 15;
      });
      if (validQuotes.length > 0) {
        return sanitizeTweetOutput(validQuotes[validQuotes.length - 1][1].trim(), customInstructions, maxLength);
      }
    }

    text = text.replace(/(?:^|\n)\s*[*•-]\s*(?:User wants|Original [Tt]weet|Target|Constraints|Tone|Topic|Goal|Category|Platform|Persona|Subject|Sentiment|Witty angles|Analyzing|Evaluating|Draft|Thinking)[^:\n]*:[^\n]*/gi, '');
    text = text.replace(/[*•-]\s*\*?Option\s*\d\*?:?/gi, '');
    text = text.replace(/Wait,\s*let'?s\s*make\s*it\s*even\s*more[^".\n]*[.:]?/gi, '');
    text = text.replace(/Under\s*\d+\s*chars\?\s*Yes\./gi, '');
    text = text.replace(/No\s*(?:hashtags|quotation)[^?]*\?\s*Yes\./gi, '');
    text = text.replace(/Natural\/Human\?\s*Yes\./gi, '');
  }

  return sanitizeTweetOutput(text, customInstructions, maxLength);
}

export function buildGeminiPostPrompt({ topicOrDraft, isDraft, isQuote, quotedText, quotedAuthor, style, customInstructions, maxLength = null }) {
  const styleDescriptions = {
    engaging: 'highly engaging, punchy, with a strong curiosity hook in the first line that grabs immediate attention',
    insight: 'informative, valuable, and actionable thought leadership or life/tech lessons',
    announcement: 'celebratory, exciting, and clear for a product launch, milestone, or major update',
    hottake: 'bold, thought-provoking, and persuasive with a contrarian or fresh angle',
    witty: 'clever, humorous, relatable, and casual with modern internet wit',
    question: 'an intriguing open-ended question designed to spark high-volume replies and discussions',
    thread: 'a compelling hook opening tweet designed to introduce a multi-part thread'
  };

  const selectedStyle = styleDescriptions[style] || styleDescriptions.engaging;
  const noEmoji = hasNoEmojiInstruction(customInstructions);
  const noHashtags = hasNoHashtagInstruction(customInstructions);
  const charLimit = resolveEffectiveMaxLength(maxLength, customInstructions, 260);
  const promptRules = stripConflictingLengthClause(customInstructions, maxLength !== null && maxLength !== undefined);
  const longFormHint = charLimit > 280 ? ' Long-form post allowed; structure cleanly with line breaks if helpful.' : '';

  const customBlock = promptRules
    ? `MANDATORY USER RULES — HIGHEST PRIORITY — OVERRIDE EVERYTHING ELSE:\n${promptRules}\n\n`
    : '';

  const hierarchyRule = promptRules
    ? '- Custom Rules override selected Style and general Requirements (except the max character limit above).\n'
    : '';

  if (isQuote && quotedText) {
    const authorMention = quotedAuthor ? ` by @${quotedAuthor}` : '';
    const angleNote = topicOrDraft && topicOrDraft !== quotedText
      ? `\nUser's angle/draft:\n"""\n${topicOrDraft}\n"""\n`
      : '';
    return `${customBlock}You are an elite Twitter (X) creator. Write a compelling quote tweet commenting on this post${authorMention}:

Quoted Tweet:
"""
${quotedText}
"""
${angleNote}
Target Style: ${selectedStyle}.
Strict Instructions:
- Output ONLY the final quote tweet text to post above the quoted tweet.
- Strictly under ${charLimit} characters total.${longFormHint}
- Add value, a sharp takeaway, or witty commentary without merely repeating the quoted tweet.
- Do NOT wrap in quotes or include preambles.
- Never start or begin the tweet with emojis or emoticons. If emojis are used, place them naturally within or at the end of sentences.
- Plain text only. Do NOT output HTML, XML, URLs, or metadata.
${hierarchyRule}${noEmoji ? '- MANDATORY: Absolutely NO emojis, symbols, or emoticons under any circumstances. Text ONLY.\n' : ''}${noHashtags ? '- MANDATORY: Absolutely NO hashtags (#).\n' : '- Do NOT include hashtags unless explicitly asked.\n'}${promptRules ? `\nREMINDER — USER RULES STILL APPLY AND CANNOT BE IGNORED:\n${promptRules}` : ''}`;
  }

  if (isDraft) {
    return `${customBlock}You are an elite Twitter (X) creator. Rewrite, polish, and optimize the following rough draft into a high-performing standalone tweet.

Draft tweet:
"""
${topicOrDraft}
"""

Target Style: ${selectedStyle}.
Strict Instructions:
- Output ONLY the final polished tweet text.
- Strictly under ${charLimit} characters total.${longFormHint}
- Maintain the original core message and intent.
- Ensure natural conversational cadence, strong opening, and clean line breaks if needed.
- Do NOT wrap in quotes.
- Do NOT include preambles like "Here is a tweet:" or "Revised:".
- Never start or begin the tweet with emojis or emoticons. If emojis are used, place them naturally within or at the end of sentences.
- Plain text only. Do NOT output HTML, XML, URLs, or metadata.
${hierarchyRule}${noEmoji ? '- MANDATORY: Absolutely NO emojis, symbols, or emoticons under any circumstances. Text ONLY.\n' : ''}${noHashtags ? '- MANDATORY: Absolutely NO hashtags (#).\n' : '- Do NOT include hashtags unless explicitly asked.\n'}${promptRules ? `\nREMINDER — USER RULES STILL APPLY AND CANNOT BE IGNORED:\n${promptRules}` : ''}`;
  }

  return `${customBlock}You are an elite Twitter (X) creator. Write an authentic, high-performing standalone tweet on the given topic or idea.

Topic / Idea:
"""
${topicOrDraft}
"""

Target Style: ${selectedStyle}.
Strict Instructions:
- Output ONLY the final tweet text.
- Strictly under ${charLimit} characters total.${longFormHint}
- Punchy first line (strong hook).
- Natural, conversational human tone (avoid corporate jargon or generic influencer clichés).
- Do NOT wrap in quotes.
- Do NOT include preambles like "Here is a tweet:" or "Tweet:".
- Never start or begin the tweet with emojis or emoticons. If emojis are used, place them naturally within or at the end of sentences.
- Plain text only. Do NOT output HTML, XML, URLs, or metadata.
${hierarchyRule}${noEmoji ? '- MANDATORY: Absolutely NO emojis, symbols, or emoticons under any circumstances. Text ONLY.\n' : ''}${noHashtags ? '- MANDATORY: Absolutely NO hashtags (#).\n' : '- Do NOT include hashtags unless explicitly asked.\n'}${promptRules ? `\nREMINDER — USER RULES STILL APPLY AND CANNOT BE IGNORED:\n${promptRules}` : ''}`;
}

export function cleanGeneratedPost(rawText, customInstructions = '', maxLength = null) {
  if (!rawText) return '';
  return cleanGeneratedReply(rawText, customInstructions, 'post', maxLength);
}
