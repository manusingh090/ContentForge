import { callGroq } from './groq.js';

export async function runReviewer(content, brandGuidelines, feedbackHistory = []) {
  const feedbackSection = feedbackHistory.length > 0
    ? `\n\nPREVIOUS REVIEW FEEDBACK TO LEARN FROM:\n${feedbackHistory.map(f => `- ${f.feedback} (Action: ${f.action})`).join('\n')}`
    : '';

  const prompt = `You are an expert Compliance Reviewer Agent for an enterprise content operations system. Your job is to review content for brand compliance, legal compliance, tone adherence, and terminology correctness.

CONTENT TO REVIEW:
Title: ${content.title}
Format: ${content.format}
Content: ${content.content}

BRAND GUIDELINES:
${JSON.stringify(brandGuidelines, null, 2)}

${feedbackSection}

REVIEW CHECKLIST:
1. **Brand Tone**: Does the content match the brand voice (${brandGuidelines.tone?.voice || 'professional'})?
2. **Terminology**: Check for banned terms and suggest preferred replacements
3. **Legal Compliance — CRITICAL CHECKS**:
   a. Flag any use of regulated terms: "guaranteed", "clinically proven", "FDA approved", "certified", "100%", "free" (without T&C)
   b. **HEALTH CLAIMS IN NON-HEALTHCARE PRODUCTS**: If the content is about a FINTECH, FINANCIAL, or TECHNOLOGY product and it contains ANY health-related claims (e.g., "reduce anxiety", "improve mental well-being", "mental health", "stress reduction", "clinically proven", "doctors recommend"), this is a **CRITICAL VIOLATION**. A fintech product CANNOT make health claims without published clinical evidence. You MUST:
      - Set "approved" to FALSE
      - Set legalScore to 25 or lower
      - Set overallScore to 40 or lower
      - Add a CRITICAL severity issue quoting the EXACT violating sentence
      - Provide a compliant rewrite that removes ALL health/medical language
   c. **GUARANTEED RETURNS/OUTCOMES**: Financial products cannot promise "guaranteed returns", "guaranteed outcomes", or use "guaranteed" for any performance claim. This is CRITICAL severity.
   d. Check if required disclaimers are missing (financial, health, AI claims)
4. **Consistency**: Are product names, company info, and messaging consistent?
5. **Quality**: Grammar, clarity, structure, and engagement level

EXAMPLES OF CRITICAL VIOLATIONS TO CATCH:
- "Our app is clinically proven to reduce stress" → CRITICAL: Health claim for a fintech product
- "Guaranteed to improve your mental well-being" → CRITICAL: Unsubstantiated health + guaranteed claim
- "Doctors recommend our financial planner" → CRITICAL: Medical endorsement for non-medical product
- "Reduces anxiety and improves mental health" → CRITICAL: Health claims require clinical evidence
- "100% of users report improved well-being" → CRITICAL: Absolute claim without verification

OUTPUT FORMAT: Return a JSON object with this exact structure:
{
  "overallScore": <number 0-100>,
  "overallLogic": "Why this overall score was given",
  "overallImprovement": "How the overall content can be improved",
  "approved": <boolean - true if score >= 75 and no critical issues>,
  "issues": [
    {
      "severity": "critical|high|medium|low",
      "category": "brand_tone|terminology|legal|consistency|quality",
      "description": "Description of the issue",
      "location": "The EXACT sentence from the content where the issue was found",
      "suggestion": "Suggested compliant rewrite of that sentence"
    }
  ],
  "summary": "Brief overall assessment",
  "toneScore": <number 0-100>,
  "toneLogic": "Logic for this specific score",
  "toneImprovement": "How to improve tone",
  "terminologyScore": <number 0-100>,
  "terminologyLogic": "Logic for this specific score",
  "terminologyImprovement": "How to improve terminology",
  "legalScore": <number 0-100>,
  "legalLogic": "Logic for this specific score",
  "legalImprovement": "How to improve legal compliance",
  "qualityScore": <number 0-100>,
  "qualityLogic": "Logic for this specific score",
  "qualityImprovement": "How to improve quality",
  "suggestedRevisions": "Specific text revisions if needed, or empty string"
}

REMEMBER: If you find ANY health claims in fintech/financial product content, the legalScore MUST be 25 or lower and approved MUST be false. This is non-negotiable.

CRITICAL: For EVERY issue you report, the "location" field MUST contain the EXACT verbatim sentence or phrase from the content that was flagged. This is used to highlight violations directly in the content preview. Do NOT paraphrase — copy the exact text.

Return ONLY valid JSON, no markdown code blocks or other formatting.`;

  console.log('  ✅ Reviewer Agent: Checking compliance...');
  const result = await callGroq(prompt);

  if (result.success) {
    const parsed = result.parsed || {
      overallScore: 70, overallLogic: "Default score logic", overallImprovement: "Review content", approved: false,
      issues: [{ severity: 'medium', category: 'quality', description: 'Could not parse detailed review', location: 'General', suggestion: 'Manual review recommended' }],
      summary: 'Review completed with limited parsing.',
      toneScore: 70, toneLogic: "Default", toneImprovement: "Review",
      terminologyScore: 70, terminologyLogic: "Default", terminologyImprovement: "Review",
      legalScore: 80, legalLogic: "Default", legalImprovement: "Review",
      qualityScore: 70, qualityLogic: "Default", qualityImprovement: "Review",
      suggestedRevisions: ''
    };
    console.log('  ✅ Reviewer Agent: Review complete - Score:', parsed.overallScore);
    return { success: true, agentName: 'Compliance Reviewer', data: parsed, processedAt: Date.now() };
  }

  console.log('  ❌ Reviewer Agent: Error -', result.error);
  return { success: false, agentName: 'Compliance Reviewer', error: result.error, processedAt: Date.now() };
}
