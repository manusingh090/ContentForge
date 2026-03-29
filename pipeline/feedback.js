import { addFeedback, getFeedbackForStage } from '../data/store.js';

/**
 * Feedback Loop System
 * Stores approval/rejection history and injects learnings into agent prompts.
 * This enables agents to improve over time based on human feedback.
 */

// Build feedback context for agent prompts
export function getFeedbackContext(stageName, maxEntries = 5) {
  const history = getFeedbackForStage(stageName, maxEntries);
  return history.map(entry => ({
    stage: entry.stage,
    action: entry.action,
    feedback: entry.feedback,
    contentType: entry.contentType || 'general',
    timestamp: entry.timestamp
  }));
}

// Record feedback from approval gates
export function recordStageFeedback({ contentId, stage, action, feedback, contentType, reviewerNotes }) {
  const entry = {
    contentId,
    stage,
    action, // 'approved', 'rejected', 'revision_requested'
    feedback: feedback || '',
    contentType: contentType || 'general',
    reviewerNotes: reviewerNotes || '',
    learnedPatterns: extractPatterns(action, feedback)
  };

  addFeedback(entry);
  return entry;
}

// Extract patterns from feedback for learning
function extractPatterns(action, feedback) {
  const patterns = [];

  if (action === 'rejected' && feedback) {
    const lower = feedback.toLowerCase();
    if (lower.includes('tone')) patterns.push('tone_adjustment_needed');
    if (lower.includes('legal') || lower.includes('compliance')) patterns.push('compliance_issue');
    if (lower.includes('terminology') || lower.includes('word')) patterns.push('terminology_correction');
    if (lower.includes('length') || lower.includes('long') || lower.includes('short')) patterns.push('length_adjustment');
    if (lower.includes('audience') || lower.includes('target')) patterns.push('audience_mismatch');
    if (lower.includes('brand') || lower.includes('voice')) patterns.push('brand_voice_correction');
  }

  if (action === 'approved' && feedback) {
    patterns.push('positive_example');
  }

  return patterns;
}

// Generate a learning summary for agents
export function getLearningsSummary(stageName) {
  const history = getFeedbackForStage(stageName, 20);

  if (history.length === 0) {
    return { hasLearnings: false, summary: 'No previous feedback available.' };
  }

  const approved = history.filter(h => h.action === 'approved').length;
  const rejected = history.filter(h => h.action === 'rejected').length;
  const revised = history.filter(h => h.action === 'revision_requested').length;

  const allPatterns = history
    .filter(h => h.learnedPatterns)
    .flatMap(h => h.learnedPatterns);

  const patternCounts = {};
  allPatterns.forEach(p => { patternCounts[p] = (patternCounts[p] || 0) + 1; });

  const topIssues = Object.entries(patternCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([pattern, count]) => ({ pattern, occurrences: count }));

  return {
    hasLearnings: true,
    totalReviews: history.length,
    approvalRate: ((approved / history.length) * 100).toFixed(1) + '%',
    summary: `Reviewed ${history.length} items: ${approved} approved, ${rejected} rejected, ${revised} revision requests.`,
    topIssues,
    recentFeedback: history.slice(-3).map(h => h.feedback).filter(Boolean)
  };
}
