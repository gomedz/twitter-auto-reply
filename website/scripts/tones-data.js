/**
 * tones-data.js
 * Realistic sample tweets and context-aware responses across all 6 tones
 * and 3 engine simulation profiles for the interactive mockup.
 */

window.SAMPLE_TWEETS = [
  {
    id: 'tweet-ai',
    category: 'AI & Developer Tech',
    author: {
      name: 'Elena Rostova',
      handle: '@elena_devs',
      verified: true,
      time: '2h',
      avatarColor: 'linear-gradient(135deg, #be8ef2, #7928ca)'
    },
    text: "Running local LLMs inside Chrome via Gemini Nano is a game changer. Sub-second response times, zero API bills, and complete privacy since data never leaves your device. Are you moving to local AI yet?",
    metrics: {
      replies: 54,
      reposts: 28,
      likes: 412,
      views: '38.4K'
    },
    replies: {
      quick: "Hybrid is the sweet spot. Gemini Nano for instant micro-replies, cloud models for heavy multimodal reasoning.",
      agree: "Completely agree! Zero latency and true on-device privacy make extension workflows feel instantaneous without worrying about API quotas.",
      thoughtful: "The biggest shift isn't just zero cost—it's eliminating telemetry anxiety. Users actually feel safe letting AI assist them on private feeds.",
      funny: "My monthly OpenAI API bill just saw Gemini Nano running on my laptop and started sweating profusely. 😂",
      debate: "While local Nano is blazing fast for short replies, complex reasoning threads still benefit from full Gemini 1.5 Pro cloud context.",
      question: "Great point! How do you find the token throughput on modest laptops without discrete GPUs?"
    }
  },
  {
    id: 'tweet-design',
    category: 'Product Design & UX',
    author: {
      name: 'Marcus Chen',
      handle: '@marcusux',
      verified: true,
      time: '4h',
      avatarColor: 'linear-gradient(135deg, #1d9bf0, #be8ef2)'
    },
    text: "The best developer tools are invisible. You shouldn't have to leave your workflow, open another tab, or copy-paste prompts just to draft a response. One click in-context wins every time.",
    metrics: {
      replies: 38,
      reposts: 19,
      likes: 295,
      views: '22.1K'
    },
    replies: {
      quick: "Spot on. Context switching is the silent killer of daily productivity.",
      agree: "100%. Native DOM injection beats external tool tab-switching every single day. Frictionless UX is king.",
      thoughtful: "Friction creates drop-off. By placing the AI trigger directly inside the native reply box, you maintain cognitive flow state.",
      funny: "Tab count currently at 87. If one more tool asks me to 'open web app to generate', Chrome will combust.",
      debate: "Contextual integration is great, but transparency matters just as much. The user must always retain review before sending.",
      question: "What's your favorite example of an extension that integrated so smoothly it felt like a native browser feature?"
    }
  },
  {
    id: 'tweet-growth',
    category: 'Solopreneur & Twitter Growth',
    author: {
      name: 'Sarah Jenkins',
      handle: '@sarahbuilds',
      verified: true,
      time: '6h',
      avatarColor: 'linear-gradient(135deg, #f59e0b, #ec4899)'
    },
    text: "Growing on 𝕏 in 2026 isn't about spamming 100 comments a day. It's about showing up early on relevant conversations with thoughtful insights that actually advance the discussion.",
    metrics: {
      replies: 82,
      reposts: 45,
      likes: 630,
      views: '54.9K'
    },
    replies: {
      quick: "Quality > quantity, always. Meaningful replies spark actual follower conversions.",
      agree: "Couldn't agree more. High-signal commentary builds authority, while generic reply spam destroys credibility.",
      thoughtful: "The real growth hack is speed + depth: being in the first 10 replies while delivering genuine value rather than platitudes.",
      funny: "Please no more 'Great post! 🚀' replies from crypto bots... my mute list is crying for help.",
      debate: "Depth is crucial, but volume still matters for algorithm momentum. The key is maintaining high quality at scale.",
      question: "What specific criteria do you use to filter which 5 accounts in your niche you reply to first each morning?"
    }
  }
];

window.TONE_DEFINITIONS = [
  { id: 'quick', label: 'Quick & Natural', icon: '⚡', description: 'Brief, sharp, organic reply' },
  { id: 'agree', label: 'Agree & Support', icon: '👍', description: 'Affirmative & constructive' },
  { id: 'thoughtful', label: 'Thoughtful Insight', icon: '💡', description: 'Deep, value-driven perspective' },
  { id: 'funny', label: 'Witty & Humorous', icon: '😂', description: 'Casual, clever internet humor' },
  { id: 'debate', label: 'Counter-Point', icon: '🔥', description: 'Respectful contrasting take' },
  { id: 'question', label: 'Ask a Question', icon: '❓', description: 'Sparks meaningful conversation' }
];

window.ENGINE_PROFILES = {
  nano: {
    name: 'Gemini Nano',
    badge: 'On-Device AI',
    speed: '~180ms',
    tabs: '0 tabs opened',
    privacy: '100% Local GPU/NPU',
    status: 'Zero network calls · Private'
  },
  headless: {
    name: 'Headless Direct',
    badge: 'Session Cookie',
    speed: '~650ms',
    tabs: '0 tabs opened',
    privacy: 'Direct to Google Session',
    status: 'Silent background sync · Free'
  },
  webtab: {
    name: 'Web Tab Automation',
    badge: 'DOM Automation',
    speed: '~1.4s',
    tabs: 'Temporary auto-closing tab',
    privacy: 'Direct to gemini.google.com',
    status: 'Auto-closes tab when done'
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SAMPLE_TWEETS, TONE_DEFINITIONS, ENGINE_PROFILES };
}
