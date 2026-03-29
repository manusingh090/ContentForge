import { callGroq } from './groq.js';

export async function runDrafter(brief, knowledgeContext, feedbackHistory = []) {
  const feedbackSection = feedbackHistory.length > 0
    ? `\n\nPREVIOUS FEEDBACK TO LEARN FROM (improve based on these past corrections):\n${feedbackHistory.map(f => `- ${f.feedback} (Stage: ${f.stage}, Action: ${f.action})`).join('\n')}`
    : '';

  const knowledgeSection = knowledgeContext && knowledgeContext.length > 0
    ? `\n\nKNOWLEDGE CONTEXT (use this information to create accurate, relevant content):\n${JSON.stringify(knowledgeContext, null, 2)}`
    : '';

  const documentSection = brief.supportingDocument
    ? `\n\nSUPPORTING DOCUMENT / PRODUCT SPEC (base your output heavily on this information):\n${brief.supportingDocument}`
    : '';

  const prompt = `You are an expert content writer and Drafter Agent for an enterprise content operations system.

YOUR TASK: Generate high-quality content based on the following brief.

CONTENT BRIEF:
- Topic: ${brief.topic}
- Format: ${brief.format || 'blog_post'}
- Target Audience: ${brief.audience || 'general business professionals'}
- Tone: ${brief.tone || 'professional yet approachable'}
- Key Messages: ${brief.keyMessages || 'Not specified'}
- Word Count Target: ${brief.wordCount || '500-800 words'}
- Additional Instructions: ${brief.instructions || 'None'}
${documentSection}
${knowledgeSection}
${feedbackSection}

IMPORTANT: Write content specifically about the product/company/topic mentioned in the brief above.
${knowledgeContext && knowledgeContext.length > 0 ? '- Use the KNOWLEDGE CONTEXT provided to include accurate details about the product/company.' : '- No internal knowledge base data matches this topic. Write based on the topic, audience, and instructions provided. Create realistic, professional content appropriate for the product/company/industry mentioned in the topic. Do NOT default to any other company or product.'}

REQUIREMENTS:
1. Create compelling, well-structured content that matches the requested format
2. Use the knowledge context (if available) to include accurate product/company information
3. Include a strong headline/title
4. For blog posts: include subheadings, intro, body sections, and conclusion
5. For social media: keep it concise, include hashtags, make it shareable
6. For email: include subject line, preview text, body, and CTA
7. For sales collateral: focus on benefits, include proof points
8. *IMPORTANT*: If the format is 'product_launch_sprint', you MUST return a comprehensive bundle containing 1 Blog Post, 3 Social Media Variants, and an Internal FAQ in the content field. Format them clearly using Markdown headers (e.g. # Blog Post, # Social Media 1, # FAQ). The Internal FAQ MUST be comprehensive, containing at least 5 to 7 distinct, detailed question-and-answer pairs covering potential audience objections, features, and clarity points.
9. Use strong, bold marketing language — incorporate product differentiators, marketing claims, and key selling points from the knowledge context directly into the content as persuasive statements. Make the content sound like confident marketing copy.

OUTPUT FORMAT: Return a JSON object with this structure:
{
  "title": "The content title/headline",
  "format": "${brief.format || 'blog_post'}",
  "content": "The full content body in markdown format",
  "summary": "A 1-2 sentence summary of the content",
  "metadata": {
    "wordCount": <number>,
    "readingTime": "<X> min read",
    "keywords": ["keyword1", "keyword2"],
    "targetAudience": "${brief.audience || 'general'}"
  }
}

Return ONLY valid JSON, no markdown code blocks or other formatting.`;

  console.log('  📝 Drafter Agent: Generating content...');
  const result = await callGroq(prompt);

  if (result.success) {
    const parsed = result.parsed || {
      title: brief.topic,
      format: brief.format || 'blog_post',
      content: result.text,
      summary: `Content about ${brief.topic}`,
      metadata: {
        wordCount: result.text.split(/\s+/).length,
        readingTime: `${Math.ceil(result.text.split(/\s+/).length / 200)} min read`,
        keywords: [brief.topic],
        targetAudience: brief.audience || 'general'
      }
    };
    console.log('  ✅ Drafter Agent: Content generated successfully');
    return { success: true, agentName: 'Drafter', data: parsed, processedAt: Date.now() };
  }

  console.log('  ❌ Drafter Agent: Error -', result.error);
  return { success: false, agentName: 'Drafter', error: result.error, processedAt: Date.now() };
}
