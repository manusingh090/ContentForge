import Groq from 'groq-sdk';
import dotenv from 'dotenv';

dotenv.config();

const groq = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;

const SYSTEM_PROMPT = `You are the ContentForge Supervisor — an assistant for enterprise content operations.
Help users with content strategy, pipeline stages (draft, compliance, localization, publish), and the ContentForge UI.
Be concise, professional, and actionable. If you lack project-specific data, say so and suggest what to check in the app.`;

function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((m) => m && typeof m.content === 'string')
    .map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    }))
    .slice(-20);
}

export async function chatWithSupervisor(prompt, history = []) {
  if (!groq) {
    return {
      success: false,
      error:
        'GROQ_API_KEY is missing in your .env file. Please get a free key from https://console.groq.com',
    };
  }

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...normalizeHistory(history),
    { role: 'user', content: String(prompt) },
  ];

  try {
    const response = await groq.chat.completions.create({
      messages,
      model: 'llama-3.3-70b-versatile',
      temperature: 0.5,
    });
    const text = response.choices[0]?.message?.content?.trim() || '';
    return { success: true, message: text };
  } catch (error) {
    console.error('Supervisor chat error:', error);
    return { success: false, error: error.message || 'Chat request failed' };
  }
}
