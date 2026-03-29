import Groq from 'groq-sdk';
import dotenv from 'dotenv';
dotenv.config();

const groq = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;

export async function callGroq(prompt, options = {}) {
  if (!groq) {
    return { 
      success: false, 
      error: 'GROQ_API_KEY is missing in your .env file. Please get a free key from console.groq.com' 
    };
  }

  const { modelName = 'llama-3.3-70b-versatile', maxRetries = 3 } = options;
  const fallbackModel = 'llama-3.1-8b-instant';
  let currentModel = modelName;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await groq.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: 'You are an AI assistant. You must ONLY output raw valid JSON. No conversational text, no markdown styling like ```json. Just raw JSON.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        model: currentModel,
        temperature: 0.2,
        response_format: { type: 'json_object' },
      });

      const text = response.choices[0]?.message?.content?.trim() || '';

      // Try to parse as JSON
      let parsed = null;
      try {
        const cleaned = text.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim();
        parsed = JSON.parse(cleaned);
      } catch (e) {
        console.log(`  ⚠️ Failed to parse JSON: ${text.substring(0, 100)}...`);
      }

      if (currentModel !== modelName) {
        console.log(`  ℹ️ Used fallback model: ${currentModel}`);
      }
      return { success: true, text, parsed };
    } catch (error) {
      const msg = error.message || '';
      console.log(`  ⏳ Groq API error (attempt ${attempt}/${maxRetries}): ${msg.substring(0, 120)}`);
      
      // If rate limited, switch to the smaller fallback model immediately
      if (msg.includes('rate_limit_exceeded') && currentModel !== fallbackModel) {
        console.log(`  🔄 Rate limit hit on ${currentModel}, switching to fallback model: ${fallbackModel}`);
        currentModel = fallbackModel;
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }

      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, attempt * 2000));
        continue;
      }

      return { success: false, error: msg };
    }
  }

  return { success: false, error: 'Max retries exceeded' };
}
