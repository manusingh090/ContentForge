import { callGroq } from './groq.js';

export async function runLocalizer(content, targetLocales, feedbackHistory = []) {
  const feedbackSection = feedbackHistory.length > 0
    ? `\n\nPREVIOUS LOCALIZATION FEEDBACK TO LEARN FROM:\n${feedbackHistory.map(f => `- ${f.feedback} (Action: ${f.action})`).join('\n')}`
    : '';

  const localesList = targetLocales
    .map(l => {
      const region = l.region ? ` — region/market: ${l.region}` : '';
      return `${l.code}: ${l.name}${region}`;
    })
    .join('\n');

  const prompt = `You are an expert Localization Agent for an enterprise content operations system. Your job is to adapt content into **regional languages** — the way people actually read and write in each **local market** — while preserving brand voice and meaning.

IMPORTANT — REGIONAL LANGUAGE (NOT "FOREIGN LANGUAGE") STYLE:
- Write for **native audiences in each region**: use everyday vocabulary, idioms, and register that locals expect in marketing, product, and web content for that area.
- Do **not** produce stiff, textbook, or "foreign language class" phrasing. Avoid overly formal or European-standard wording when the target is a regional variant (e.g. Indian languages, Latin American Spanish, Brazilian Portuguese).
- For each BCP-47 style locale code (e.g. hi-IN, ta-IN, en-IN, es-MX), follow spelling, terminology, and cultural norms for **that specific region**, not a generic "standard" from another country.
- For Indic and other regional scripts, use the **correct script and natural sentence flow** for that region.

ORIGINAL CONTENT:
Title: ${content.title}
Format: ${content.format}
Content: ${content.content}

TARGET REGIONAL LOCALES (one block per target):
${localesList}

${feedbackSection}

LOCALIZATION GUIDELINES:
1. Adapt meaning naturally — do NOT do literal word-for-word translation
2. Adapt cultural references, idioms, and metaphors for each **region**
3. Keep brand names, product names, and technical terms per local convention (often English in tech, or established local forms)
4. Adapt date formats, number formats, and currency references to the region
5. Maintain the original tone and emotional impact in a **region-appropriate** voice
6. Adapt marketing messages for **local** market preferences in that geography
7. For social content, hashtags may stay Latin script if platform norms require; body text must stay fully regional

OUTPUT FORMAT: Return a JSON object with this exact structure:
{
  "localizations": {
    "${targetLocales[0]?.code || 'hi-IN'}": {
      "title": "Localized title",
      "content": "Fully localized content",
      "locale": "${targetLocales[0]?.code || 'hi-IN'}",
      "localeName": "${targetLocales[0]?.name || 'Hindi (India)'}",
      "adaptationNotes": "Brief notes on cultural adaptations made"
    }
  },
  "summary": "Brief summary of localization approach",
  "qualityNotes": "Any quality concerns or areas needing human review"
}

For EACH target locale, include an entry in the "localizations" object keyed by locale code.

Return ONLY valid JSON, no markdown code blocks or other formatting.`;

  console.log('  🌐 Localizer Agent: Localizing to', localesList, '...');
  const result = await callGroq(prompt);

  if (result.success) {
    const parsed = result.parsed || {
      localizations: {}, summary: 'Localization completed but response parsing had issues',
      qualityNotes: 'Manual review of translations recommended'
    };
    console.log('  ✅ Localizer Agent: Localization complete');
    return { success: true, agentName: 'Localizer', data: parsed, processedAt: Date.now() };
  }

  console.log('  ❌ Localizer Agent: Error -', result.error);
  return { success: false, agentName: 'Localizer', error: result.error, processedAt: Date.now() };
}
