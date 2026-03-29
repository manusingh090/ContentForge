import { runDrafter } from '../agents/drafter.js';
import { runReviewer } from '../agents/reviewer.js';
import { runLocalizer } from '../agents/localizer.js';
import { runPublisher } from '../agents/publisher.js';
import {
  createContentItem, getContentItem, updateContentItem, updateStage,
  getBrandGuidelines, getKnowledgeContext,
  recordCycleTime, recordApproval, recordComplianceScore, recordChannelPublish
} from '../data/store.js';
import { getFeedbackContext, recordStageFeedback } from './feedback.js';

/**
 * Pipeline Orchestrator
 * Manages the content lifecycle: Draft → Review → Localize → Publish
 * Handles stage transitions, approval gates, and handoff protocols.
 */

const STAGES = ['drafting', 'review', 'localization', 'publishing'];
const STAGE_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  AWAITING_APPROVAL: 'awaiting_approval',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  REVISION_REQUESTED: 'revision_requested',
  COMPLETED: 'completed',
  SKIPPED: 'skipped'
};

// --- Start a new content pipeline ---
export async function startPipeline(brief) {
  const item = createContentItem(brief);

  // Begin drafting stage
  updateStage(item.id, 'drafting', { status: STAGE_STATUS.IN_PROGRESS, startedAt: Date.now() });
  updateContentItem(item.id, { status: 'drafting_in_progress', currentStage: 'drafting' });

  // Get knowledge context based on the brief topic
  const knowledgeContext = getKnowledgeContext(brief.topic);
  const feedbackHistory = getFeedbackContext('drafting');

  // Run the drafter agent asynchronously
  runDrafter(brief, knowledgeContext, feedbackHistory).then(draftResult => {
    if (draftResult.success) {
      updateStage(item.id, 'drafting', {
        status: STAGE_STATUS.AWAITING_APPROVAL,
        completedAt: Date.now(),
        result: draftResult.data
      });
      updateContentItem(item.id, {
        status: 'draft_awaiting_approval',
        content: draftResult.data,
        currentStage: 'drafting'
      });
    } else {
      updateStage(item.id, 'drafting', {
        status: STAGE_STATUS.REJECTED,
        completedAt: Date.now(),
        result: { error: draftResult.error }
      });
      updateContentItem(item.id, { status: 'draft_failed', currentStage: 'drafting' });
    }
  }).catch(err => {
    console.error("Drafter async error:", err);
    updateStage(item.id, 'drafting', {
      status: STAGE_STATUS.REJECTED,
      completedAt: Date.now(),
      result: { error: err.message }
    });
    updateContentItem(item.id, { status: 'draft_failed', currentStage: 'drafting' });
  });

  return getContentItem(item.id);
}

// --- Handle approval at any stage ---
export async function handleApproval(contentId, stage, action, feedback = '', modifiedContent = null) {
  const item = getContentItem(contentId);
  if (!item) throw new Error('Content item not found');

  if (modifiedContent && item.content) {
    updateContentItem(contentId, {
      content: { ...item.content, content: modifiedContent }
    });
  }

  // Record feedback for learning
  recordStageFeedback({
    contentId,
    stage,
    action,
    feedback,
    contentType: item.brief?.format
  });

  if (action === 'approved') {
    updateStage(contentId, stage, { status: STAGE_STATUS.APPROVED });

    // Determine next stage and advance
    const currentIndex = STAGES.indexOf(stage);
    if (currentIndex < STAGES.length - 1) {
      const nextStage = STAGES[currentIndex + 1];
      return await advanceToStage(contentId, nextStage);
    } else {
      // Pipeline complete — count as approved only here
      recordApproval(true);
      const cycleTime = Date.now() - item.cycleStartTime;
      recordCycleTime(contentId, cycleTime);
      updateContentItem(contentId, {
        status: 'completed',
        currentStage: 'completed',
        cycleEndTime: Date.now()
      });
      return getContentItem(contentId);
    }
  } else if (action === 'rejected') {
    recordApproval(false);
    updateStage(contentId, stage, {
      status: STAGE_STATUS.REJECTED,
      result: { ...item.stages[stage].result, rejectionFeedback: feedback }
    });
    updateContentItem(contentId, { status: `${stage}_rejected` });
    return getContentItem(contentId);
  } else if (action === 'revision_requested') {
    // Re-run the current stage with feedback
    return await rerunStage(contentId, stage, feedback);
  }

  return getContentItem(contentId);
}

// --- Advance to next pipeline stage ---
async function advanceToStage(contentId, nextStage) {
  const item = getContentItem(contentId);
  if (!item) throw new Error('Content item not found');

  updateStage(contentId, nextStage, { status: STAGE_STATUS.IN_PROGRESS, startedAt: Date.now() });
  updateContentItem(contentId, { status: `${nextStage}_in_progress`, currentStage: nextStage });

  let result;

  switch (nextStage) {
    case 'review':
      result = await executeReview(contentId);
      break;
    case 'localization':
      result = await executeLocalization(contentId);
      break;
    case 'publishing':
      result = await executePublishing(contentId);
      break;
    default:
      throw new Error(`Unknown stage: ${nextStage}`);
  }

  return result;
}

// --- Execute Review Stage ---
async function executeReview(contentId) {
  const item = getContentItem(contentId);
  const brandGuidelines = getBrandGuidelines();
  const feedbackHistory = getFeedbackContext('review');

  const reviewResult = await runReviewer(item.content, brandGuidelines, feedbackHistory);

  if (reviewResult.success) {
    const reviewData = reviewResult.data;
    recordComplianceScore(reviewData.overallScore || 0);

    updateStage(contentId, 'review', {
      status: STAGE_STATUS.AWAITING_APPROVAL,
      completedAt: Date.now(),
      result: reviewData
    });
    updateContentItem(contentId, {
      status: 'review_awaiting_approval',
      reviewFeedback: reviewData,
      currentStage: 'review'
    });
  } else {
    updateStage(contentId, 'review', {
      status: STAGE_STATUS.REJECTED,
      completedAt: Date.now(),
      result: { error: reviewResult.error }
    });
    updateContentItem(contentId, { status: 'review_failed', currentStage: 'review' });
  }

  return getContentItem(contentId);
}

// --- Execute Localization Stage ---
async function executeLocalization(contentId) {
  const item = getContentItem(contentId);
  const feedbackHistory = getFeedbackContext('localization');

  const targetLocales = item.brief.locales || [
    { code: 'hi-IN', name: 'Hindi (India)', region: 'India' },
    { code: 'ta-IN', name: 'Tamil (India)', region: 'India' }
  ];

  const localizeResult = await runLocalizer(item.content, targetLocales, feedbackHistory);

  if (localizeResult.success) {
    updateStage(contentId, 'localization', {
      status: STAGE_STATUS.AWAITING_APPROVAL,
      completedAt: Date.now(),
      result: localizeResult.data
    });
    updateContentItem(contentId, {
      status: 'localization_awaiting_approval',
      localizedContent: localizeResult.data.localizations || {},
      currentStage: 'localization'
    });
  } else {
    updateStage(contentId, 'localization', {
      status: STAGE_STATUS.REJECTED,
      completedAt: Date.now(),
      result: { error: localizeResult.error }
    });
    updateContentItem(contentId, { status: 'localization_failed', currentStage: 'localization' });
  }

  return getContentItem(contentId);
}

// --- Execute Publishing Stage ---
async function executePublishing(contentId) {
  const item = getContentItem(contentId);
  const feedbackHistory = getFeedbackContext('publishing');

  const targetChannels = item.brief.channels || ['blog', 'twitter', 'linkedin', 'email'];
  const localizedContent = item.localizedContent || {};

  const publishResult = await runPublisher(item.content, targetChannels, feedbackHistory, localizedContent);

  if (publishResult.success) {
    // Record channel distributions
    targetChannels.forEach(ch => recordChannelPublish(ch));

    updateStage(contentId, 'publishing', {
      status: STAGE_STATUS.AWAITING_APPROVAL,
      completedAt: Date.now(),
      result: publishResult.data
    });
    updateContentItem(contentId, {
      status: 'publishing_awaiting_approval',
      publishedContent: publishResult.data.publications || {},
      currentStage: 'publishing'
    });
  } else {
    updateStage(contentId, 'publishing', {
      status: STAGE_STATUS.REJECTED,
      completedAt: Date.now(),
      result: { error: publishResult.error }
    });
    updateContentItem(contentId, { status: 'publishing_failed', currentStage: 'publishing' });
  }

  return getContentItem(contentId);
}

// --- Re-run a stage with feedback corrections ---
async function rerunStage(contentId, stage, feedback) {
  const item = getContentItem(contentId);

  updateStage(contentId, stage, {
    status: STAGE_STATUS.IN_PROGRESS,
    startedAt: Date.now(),
    completedAt: null
  });
  updateContentItem(contentId, { status: `${stage}_revision_in_progress`, currentStage: stage });

  // Re-run the appropriate agent
  switch (stage) {
    case 'drafting': {
      const knowledgeContext = getKnowledgeContext(item.brief.topic);
      const feedbackHistory = getFeedbackContext('drafting');
      // Add the current feedback to history temporarily
      feedbackHistory.push({ stage: 'drafting', action: 'revision_requested', feedback });

      const result = await runDrafter(item.brief, knowledgeContext, feedbackHistory);
      if (result.success) {
        updateStage(contentId, 'drafting', {
          status: STAGE_STATUS.AWAITING_APPROVAL,
          completedAt: Date.now(),
          result: result.data
        });
        updateContentItem(contentId, {
          status: 'draft_awaiting_approval',
          content: result.data,
          currentStage: 'drafting'
        });
      }
      break;
    }
    case 'review': {
      if (feedback && feedback.includes('Please apply the following specific fixes:')) {
        const { callGroq } = await import('../agents/groq.js');
        const prompt = `You are a compliance fixer. Revise the following draft to EXACTLY address the specific feedback provided. Do not change the overall tone unless requested.
CONTENT TO REVISE:
${item.content?.content || ''}

FEEDBACK TO ADDRESS:
${feedback}

OUTPUT FORMAT:
Return JSON in the exact format:
{
  "content": "The completely rewritten content incorporating all feedback."
}
`;
        console.log('  🧠 Orchestrator: Auto-fixing review issues using AI...');
        const result = await callGroq(prompt);
        if (result.success && result.parsed?.content) {
          updateContentItem(contentId, {
            content: { ...item.content, content: result.parsed.content }
          });
        } else {
          console.log('  ❌ Orchestrator: Auto-fix failed or invalid JSON.');
        }
      }
      return await executeReview(contentId);
    }
    case 'localization':
      return await executeLocalization(contentId);
    case 'publishing':
      return await executePublishing(contentId);
  }

  return getContentItem(contentId);
}

// --- Retry a failed stage ---
export async function retryStage(contentId, stage) {
  const item = getContentItem(contentId);
  if (!item) throw new Error('Content item not found');

  // Reset the stage
  updateStage(contentId, stage, {
    status: STAGE_STATUS.IN_PROGRESS,
    startedAt: Date.now(),
    completedAt: null,
    result: null
  });
  updateContentItem(contentId, { status: `${stage}_in_progress`, currentStage: stage });

  // Re-run the appropriate agent
  switch (stage) {
    case 'drafting': {
      const knowledgeContext = getKnowledgeContext(item.brief.topic);
      const feedbackHistory = getFeedbackContext('drafting');
      const result = await runDrafter(item.brief, knowledgeContext, feedbackHistory);
      if (result.success) {
        updateStage(contentId, 'drafting', {
          status: STAGE_STATUS.AWAITING_APPROVAL,
          completedAt: Date.now(),
          result: result.data
        });
        updateContentItem(contentId, {
          status: 'draft_awaiting_approval',
          content: result.data,
          currentStage: 'drafting'
        });
      } else {
        updateStage(contentId, 'drafting', {
          status: STAGE_STATUS.REJECTED,
          completedAt: Date.now(),
          result: { error: result.error }
        });
        updateContentItem(contentId, { status: 'draft_failed', currentStage: 'drafting' });
      }
      break;
    }
    case 'review':
      return await executeReview(contentId);
    case 'localization':
      return await executeLocalization(contentId);
    case 'publishing':
      return await executePublishing(contentId);
    default:
      throw new Error(`Unknown stage: ${stage}`);
  }

  return getContentItem(contentId);
}

// --- Get pipeline status summary ---
export function getPipelineStatus(contentId) {
  const item = getContentItem(contentId);
  if (!item) return null;

  const stageStatuses = {};
  let completedStages = 0;

  for (const stage of STAGES) {
    const s = item.stages[stage];
    stageStatuses[stage] = {
      status: s.status,
      duration: s.startedAt && s.completedAt ? s.completedAt - s.startedAt : null,
      durationFormatted: s.startedAt && s.completedAt
        ? formatDuration(s.completedAt - s.startedAt)
        : s.startedAt
          ? 'In progress...'
          : 'Pending'
    };
    if (s.status === STAGE_STATUS.APPROVED || s.status === STAGE_STATUS.COMPLETED) {
      completedStages++;
    }
  }

  return {
    contentId: item.id,
    currentStage: item.currentStage,
    overallStatus: item.status,
    progress: Math.round((completedStages / STAGES.length) * 100),
    stages: stageStatuses,
    totalElapsed: formatDuration(Date.now() - item.cycleStartTime),
    totalElapsedMs: Date.now() - item.cycleStartTime
  };
}

function formatDuration(ms) {
  if (!ms) return '0s';
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}
