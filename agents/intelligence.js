import { callGroq } from './groq.js';

export async function runIntelligence(engagementData, currentStrategy = null, history = []) {
  const historySnippet = history.length > 0
    ? `PREVIOUS ANALYSIS HISTORY:\n${JSON.stringify(history, null, 2)}\n\nCRITICAL CONTEXT: You must review your past recommendations from the history above. If the engagement trends are changing in response to your past recommendations, note it. DO NOT repeat the exact same recommendations you made previously unless they are still critically relevant and appear unimplemented. Your goal is to provide net-new insights and adapt your strategy based on the historical context.`
    : '';

  const prompt = `You are an expert Content Intelligence Agent for an enterprise content operations system. Your job is to analyze engagement data, spot patterns, and generate actionable strategy recommendations.

ENGAGEMENT DATA (last 14 days across channels):
${JSON.stringify(engagementData, null, 2)}

${currentStrategy ? `CURRENT STRATEGY:\n${JSON.stringify(currentStrategy, null, 2)}\n\n` : ''}
${historySnippet}

ANALYSIS TASKS:
1. **Trend Analysis**: Identify upward/downward trends in views, clicks, shares, conversions
2. **Channel Performance**: Compare performance across channels, identify top performers
3. **Content Patterns**: What types of content get the most engagement?
4. **Timing Insights**: When do posts perform best?
5. **Recommendations**: Specific, actionable strategy adjustments. *CRITICAL: If you notice 'youtube' (video format) massively outperforming text formats (blog/twitter) by 4x or more, you MUST recommend a major strategy shift to video, and include a brief 'Video Content Calendar' outline in your recommendations.*

OUTPUT FORMAT: Return a JSON object with this exact structure:
{
  "analysis": {
    "overallTrend": "improving|declining|stable",
    "trendDescription": "Brief description of overall performance trend",
    "topChannel": "The channel with best overall performance",
    "weakestChannel": "The channel needing most improvement",
    "engagementRate": "<calculated engagement rate as percentage>",
    "conversionRate": "<calculated conversion rate as percentage>"
  },
  "channelInsights": {
    "blog": { "performance": "strong|moderate|weak", "trend": "up|down|stable", "keyMetric": "description" },
    "twitter": { "performance": "strong|moderate|weak", "trend": "up|down|stable", "keyMetric": "description" },
    "linkedin": { "performance": "strong|moderate|weak", "trend": "up|down|stable", "keyMetric": "description" },
    "email": { "performance": "strong|moderate|weak", "trend": "up|down|stable", "keyMetric": "description" },
    "youtube": { "performance": "strong|moderate|weak", "trend": "up|down|stable", "keyMetric": "description" }
  },
  "recommendations": [
    {
      "priority": "high|medium|low",
      "area": "scheduling|format|targeting|content_type|channel_focus",
      "recommendation": "Specific actionable recommendation",
      "expectedImpact": "Expected result of implementing this recommendation",
      "timeframe": "How long until results should be visible"
    }
  ],
  "contentSuggestions": [
    {
      "topic": "Suggested content topic",
      "format": "blog|social|email|video",
      "targetChannel": "Primary channel",
      "rationale": "Why this content should be created"
    }
  ],
  "contentCalendar": [
    {
      "date": "Suggested date (e.g. Next Monday)",
      "topic": "Content topic",
      "format": "video|blog|social|press_release",
      "status": "planned"
    }
  ],
  "summary": "Executive summary of the analysis (2-3 sentences)"
}

Return ONLY valid JSON, no markdown code blocks or other formatting.`;

  console.log('  🧠 Intelligence Agent: Analyzing engagement data...');
  const result = await callGroq(prompt);

  if (result.success) {
    const parsed = result.parsed || {
      analysis: { overallTrend: 'stable', trendDescription: 'Analysis completed but response parsing had issues', topChannel: 'unknown', weakestChannel: 'unknown', engagementRate: 'N/A', conversionRate: 'N/A' },
      channelInsights: {}, recommendations: [{ priority: 'medium', area: 'content_type', recommendation: 'Manual analysis recommended', expectedImpact: 'N/A', timeframe: 'N/A' }],
      contentSuggestions: [], contentCalendar: [], summary: 'Intelligence analysis completed. Manual review recommended.'
    };
    console.log('  ✅ Intelligence Agent: Analysis complete');
    return { success: true, agentName: 'Content Intelligence', data: parsed, processedAt: Date.now() };
  }

  console.log('  ❌ Intelligence Agent: Error -', result.error);
  return { success: false, agentName: 'Content Intelligence', error: result.error, processedAt: Date.now() };
}
