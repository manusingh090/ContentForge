import { callGroq } from './groq.js';

export async function runPublisher(content, targetChannels, feedbackHistory = [], localizedContent = {}) {
  const feedbackSection = feedbackHistory.length > 0
    ? `\n\nPREVIOUS PUBLISHING FEEDBACK TO LEARN FROM:\n${feedbackHistory.map(f => `- ${f.feedback} (Action: ${f.action})`).join('\n')}`
    : '';

  const channelsList = targetChannels.join(', ');

  // Build localized content section
  const locales = Object.keys(localizedContent);
  const localizedSection = locales.length > 0
    ? `\n\nLOCALIZED CONTENT (Regional Language Versions):\n${locales.map(loc => {
        const lc = localizedContent[loc];
        return `--- ${lc.localeName || loc} (${loc}) ---\n${lc.content || 'No content available'}`;
      }).join('\n\n')}\n\nIMPORTANT: For EACH channel, publish content in ALL available languages. Include the English version AND each regional language version. Structure the output so each channel has a "localizedVersions" object with locale codes as keys.`
    : '';

  const prompt = `You are an expert Multi-Channel Publisher Agent for an enterprise content operations system. Your job is to adapt and format content for specific distribution channels with platform-specific optimizations.

ORIGINAL CONTENT (English):
Title: ${content.title}
Format: ${content.format}
Content: ${content.content}
Summary: ${content.summary || ''}
${localizedSection}

TARGET CHANNELS: ${channelsList}

${feedbackSection}

CHANNEL-SPECIFIC REQUIREMENTS:

**Blog**: Full article with HTML formatting, meta description, featured image suggestion, SEO-optimized title
**Twitter/X**: Thread of tweets (280 char each), engaging hooks, relevant hashtags, visual suggestions
**LinkedIn**: Professional post, industry insight angle, engagement question, appropriate hashtags
**Email Newsletter**: Subject line, preview text, HTML-structured body, clear CTA, unsubscribe reminder

OUTPUT FORMAT: Return a JSON object with this exact structure:
{
  "publications": {
    "blog": {
      "title": "SEO-optimized title",
      "metaDescription": "Meta description for SEO",
      "content": "Full blog content",
      "featuredImageSuggestion": "Description of ideal featured image",
      "tags": ["tag1", "tag2"],
      "scheduledTime": "Suggested publish time",
      "localizedVersions": {
        "hi-IN": { "title": "Hindi title", "content": "Hindi blog content" },
        "ta-IN": { "title": "Tamil title", "content": "Tamil blog content" }
      }
    },
    "twitter": {
      "thread": ["Tweet 1 text", "Tweet 2 text"],
      "hashtags": ["#hashtag1"],
      "scheduledTime": "Suggested post time",
      "localizedVersions": {
        "hi-IN": { "thread": ["Hindi tweet 1", "Hindi tweet 2"] },
        "ta-IN": { "thread": ["Tamil tweet 1", "Tamil tweet 2"] }
      }
    },
    "linkedin": {
      "content": "Full LinkedIn post text",
      "hashtags": ["#hashtag1"],
      "scheduledTime": "Suggested post time",
      "localizedVersions": {
        "hi-IN": { "content": "Hindi LinkedIn post" },
        "ta-IN": { "content": "Tamil LinkedIn post" }
      }
    },
    "email": {
      "subjectLine": "Email subject",
      "previewText": "Preview text snippet",
      "htmlBody": "Email body content",
      "cta": { "text": "CTA button text", "url": "https://example.com" },
      "scheduledTime": "Suggested send time",
      "localizedVersions": {
        "hi-IN": { "subjectLine": "Hindi subject", "htmlBody": "Hindi email body" },
        "ta-IN": { "subjectLine": "Tamil subject", "htmlBody": "Tamil email body" }
      }
    }
  },
  "publishingStrategy": "Brief strategy overview and rationale for timing",
  "crossChannelNotes": "Notes on content consistency across channels"
}

Only include entries for the requested channels: ${channelsList}
${locales.length > 0 ? `Include localizedVersions for these locales: ${locales.join(', ')}` : 'No localizedVersions needed.'}

Return ONLY valid JSON, no markdown code blocks or other formatting.`;

  console.log('  📢 Publisher Agent: Formatting for', channelsList, '...');
  const result = await callGroq(prompt);

  if (result.success) {
    const parsed = result.parsed || {
      publications: {}, publishingStrategy: 'Content formatted but response parsing had issues',
      crossChannelNotes: 'Manual formatting review recommended'
    };
    console.log('  ✅ Publisher Agent: Published to', Object.keys(parsed.publications || {}).join(', '));
    return { success: true, agentName: 'Publisher', data: parsed, processedAt: Date.now() };
  }

  console.log('  ❌ Publisher Agent: Error -', result.error);
  return { success: false, agentName: 'Publisher', error: result.error, processedAt: Date.now() };
}
