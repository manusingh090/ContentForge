import { readFileSync, writeFileSync, existsSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const STATE_FILE = join(__dirname, 'app-state.json');
let persistTimer = null;

// --- In-memory store ---
const store = {
  contentItems: new Map(),
  pipelines: new Map(),
  feedback: [],
  analytics: {
    totalContentCreated: 0,
    totalApproved: 0,
    totalRejected: 0,
    averageCycleTimeMs: 0,
    cycleTimes: [],
    channelDistribution: { blog: 0, twitter: 0, linkedin: 0, email: 0, youtube: 0 },
    complianceScores: [],
    engagementData: [],
    intelligenceHistory: []
  }
};

// --- Brand Guidelines ---
let brandGuidelines = {};
try {
  brandGuidelines = JSON.parse(readFileSync(join(__dirname, 'brand-guidelines.json'), 'utf-8'));
} catch (e) {
  console.warn('Could not load brand guidelines:', e.message);
}

// --- Knowledge Base ---
let knowledgeBase = {};
try {
  knowledgeBase = JSON.parse(readFileSync(join(__dirname, 'knowledge-base.json'), 'utf-8'));
} catch (e) {
  console.warn('Could not load knowledge base:', e.message);
}

function loadPersistedState() {
  if (!existsSync(STATE_FILE)) return;
  try {
    const data = JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
    if (data.contentItems && typeof data.contentItems === 'object' && !Array.isArray(data.contentItems)) {
      store.contentItems = new Map(Object.entries(data.contentItems));
    }
    if (Array.isArray(data.feedback)) {
      store.feedback = data.feedback;
    }
    if (data.analytics && typeof data.analytics === 'object') {
      for (const key of Object.keys(store.analytics)) {
        if (data.analytics[key] !== undefined) {
          store.analytics[key] = data.analytics[key];
        }
      }
    }
    console.log(`Restored app state: ${store.contentItems.size} content item(s).`);
  } catch (e) {
    console.warn('Could not load app state:', e.message);
  }
}

export function flushPersist() {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  try {
    const payload = {
      version: 1,
      savedAt: Date.now(),
      contentItems: Object.fromEntries(store.contentItems),
      feedback: store.feedback,
      analytics: store.analytics
    };
    writeFileSync(STATE_FILE, JSON.stringify(payload), 'utf-8');
  } catch (e) {
    console.warn('Failed to persist app state:', e.message);
  }
}

function schedulePersist() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    flushPersist();
  }, 400);
}

loadPersistedState();

// --- Content Item CRUD ---
export function createContentItem(brief) {
  const id = uuidv4();
  const now = Date.now();
  const item = {
    id,
    brief,
    status: 'draft_pending',
    stages: {
      drafting: { status: 'pending', startedAt: now, completedAt: null, result: null },
      review: { status: 'pending', startedAt: null, completedAt: null, result: null },
      localization: { status: 'pending', startedAt: null, completedAt: null, result: null },
      publishing: { status: 'pending', startedAt: null, completedAt: null, result: null }
    },
    currentStage: 'drafting',
    content: null,
    localizedContent: {},
    publishedContent: {},
    reviewFeedback: null,
    approvals: [],
    createdAt: now,
    updatedAt: now,
    cycleStartTime: now,
    cycleEndTime: null
  };
  store.contentItems.set(id, item);
  store.analytics.totalContentCreated++;
  schedulePersist();
  return item;
}

export function getContentItem(id) {
  return store.contentItems.get(id) || null;
}

export function getAllContentItems() {
  return Array.from(store.contentItems.values()).sort((a, b) => b.createdAt - a.createdAt);
}

export function updateContentItem(id, updates) {
  const item = store.contentItems.get(id);
  if (!item) return null;
  Object.assign(item, updates, { updatedAt: Date.now() });
  store.contentItems.set(id, item);
  schedulePersist();
  return item;
}

export function updateStage(id, stageName, stageUpdates) {
  const item = store.contentItems.get(id);
  if (!item || !item.stages[stageName]) return null;
  Object.assign(item.stages[stageName], stageUpdates);
  item.updatedAt = Date.now();
  store.contentItems.set(id, item);
  schedulePersist();
  return item;
}

// --- Analytics ---
export function recordCycleTime(contentId, durationMs) {
  store.analytics.cycleTimes.push({ contentId, durationMs, timestamp: Date.now() });
  const times = store.analytics.cycleTimes.map(t => t.durationMs);
  store.analytics.averageCycleTimeMs = times.reduce((a, b) => a + b, 0) / times.length;
  schedulePersist();
}

export function recordApproval(approved) {
  if (approved) store.analytics.totalApproved++;
  else store.analytics.totalRejected++;
  schedulePersist();
}

export function recordComplianceScore(score) {
  store.analytics.complianceScores.push({ score, timestamp: Date.now() });
  schedulePersist();
}

export function recordChannelPublish(channel) {
  if (store.analytics.channelDistribution[channel] !== undefined) {
    store.analytics.channelDistribution[channel]++;
  }
  schedulePersist();
}

export function recordEngagement(data) {
  if (data.contentId && !data.contentTitle) {
    const item = store.contentItems.get(data.contentId);
    if (item) data.contentTitle = item.content?.title || item.brief?.topic;
  }
  store.analytics.engagementData.push({ ...data, timestamp: Date.now() });
  schedulePersist();
}

export function recordIntelligenceAnalysis(analysisData) {
  store.analytics.intelligenceHistory.push({
    timestamp: Date.now(),
    date: new Date().toISOString(),
    analysis: analysisData
  });
  schedulePersist();
}

export function getIntelligenceHistory() {
  return store.analytics.intelligenceHistory;
}

export function getAnalytics() {
  const avgCompliance = store.analytics.complianceScores.length > 0
    ? store.analytics.complianceScores.reduce((a, b) => a + b.score, 0) / store.analytics.complianceScores.length
    : 0;

  return {
    totalContentCreated: store.analytics.totalContentCreated,
    totalApproved: store.analytics.totalApproved,
    totalRejected: store.analytics.totalRejected,
    approvalRate: store.analytics.totalApproved + store.analytics.totalRejected > 0
      ? (store.analytics.totalApproved / (store.analytics.totalApproved + store.analytics.totalRejected) * 100).toFixed(1)
      : 0,
    averageCycleTimeMs: Math.round(store.analytics.averageCycleTimeMs),
    averageCycleTimeFormatted: formatDuration(store.analytics.averageCycleTimeMs),
    channelDistribution: store.analytics.channelDistribution,
    averageComplianceScore: Math.round(avgCompliance * 10) / 10,
    recentCycleTimes: store.analytics.cycleTimes.slice(-10).map(ct => {
      const item = store.contentItems.get(ct.contentId);
      return {
        ...ct,
        title: item?.content?.title || item?.brief?.topic || 'Untitled'
      };
    }),
    engagementData: store.analytics.engagementData.slice(-100), // increased from 20 to support grouping
    intelligenceHistory: store.analytics.intelligenceHistory
  };
}

// --- Feedback Store ---
export function addFeedback(entry) {
  store.feedback.push({ ...entry, timestamp: Date.now(), id: uuidv4() });
  schedulePersist();
}

export function getFeedbackHistory(limit = 20) {
  return store.feedback.slice(-limit);
}

export function getFeedbackForStage(stageName, limit = 10) {
  return store.feedback
    .filter(f => f.stage === stageName)
    .slice(-limit);
}

// --- Knowledge & Brand Access ---
export function getBrandGuidelines() {
  return brandGuidelines;
}

export function updateBrandGuidelines(updates) {
  // Merge updates deeply
  if (updates.tone) {
    brandGuidelines.tone = { ...brandGuidelines.tone, ...updates.tone };
  }
  if (updates.toneGuideline) {
    if (!brandGuidelines.tone.guidelines) brandGuidelines.tone.guidelines = [];
    brandGuidelines.tone.guidelines.push(updates.toneGuideline);
  }
  
  try {
    writeFileSync(join(__dirname, 'brand-guidelines.json'), JSON.stringify(brandGuidelines, null, 2));
  } catch(e) {
    console.warn("Failed to save brand guidelines:", e);
  }
  
  return brandGuidelines;
}

export function getKnowledgeBase() {
  return knowledgeBase;
}

export function getKnowledgeContext(topic) {
  const kb = knowledgeBase;
  const context = [];

  // Search products
  if (kb.products) {
    for (const product of kb.products) {
      const searchText = JSON.stringify(product).toLowerCase();
      if (!topic || searchText.includes(topic.toLowerCase())) {
        context.push({ type: 'product', data: product });
      }
    }
  }

  // Search news
  if (kb.recentNews) {
    for (const news of kb.recentNews) {
      const searchText = JSON.stringify(news).toLowerCase();
      if (!topic || searchText.includes(topic.toLowerCase())) {
        context.push({ type: 'news', data: news });
      }
    }
  }

  // Search testimonials
  if (kb.customerTestimonials) {
    for (const testimonial of kb.customerTestimonials) {
      const searchText = JSON.stringify(testimonial).toLowerCase();
      if (!topic || searchText.includes(topic.toLowerCase())) {
        context.push({ type: 'testimonial', data: testimonial });
      }
    }
  }

  // Only include company info if topic relates to a known product/company
  const topicLower = (topic || '').toLowerCase();
  const companyName = (kb.company?.name || '').toLowerCase();
  const hasMatchingProduct = context.some(c => c.type === 'product');
  const mentionsCompany = topicLower.includes(companyName) || companyName.includes(topicLower.split(' ')[0] || '---');
  
  if (hasMatchingProduct || mentionsCompany) {
    if (kb.company) context.push({ type: 'company', data: kb.company });
    if (kb.industryInsights) context.push({ type: 'insights', data: kb.industryInsights });
  }

  return context;
}

// --- Utility ---
function formatDuration(ms) {
  if (!ms || ms === 0) return '0s';
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

// --- Seed demo engagement data ---
export function seedDemoData() {
  const channels = ['blog', 'twitter', 'linkedin', 'email', 'youtube'];
  const now = Date.now();
  const day = 86400000;

  for (let i = 14; i >= 0; i--) {
    for (const channel of channels) {
      recordEngagement({
        channel,
        date: new Date(now - i * day).toISOString().split('T')[0],
        views: Math.floor(Math.random() * 5000) + 500,
        clicks: Math.floor(Math.random() * 800) + 50,
        shares: Math.floor(Math.random() * 200) + 10,
        conversions: Math.floor(Math.random() * 50) + 2
      });
    }
  }
}

// --- Inject Video Outperformance Data ---
export function injectVideoOutperformanceData() {
  const now = Date.now();
  const day = 86400000;
  
  // Wipe last 14 days of engagement and insert a massive spike for youtube
  store.analytics.engagementData = [];
  seedDemoData(); // Re-seed normal data first
  
  // Now add 4x outperformance for youtube exactly over the past 7 days
  for (let i = 6; i >= 0; i--) {
    recordEngagement({
      channel: 'youtube', // representing Video
      date: new Date(now - i * day).toISOString().split('T')[0],
      views: Math.floor(Math.random() * 20000) + 15000,   // 4x Views!
      clicks: Math.floor(Math.random() * 4000) + 2000,    // 4x Clicks!
      shares: Math.floor(Math.random() * 1000) + 500,     // massive shares
      conversions: Math.floor(Math.random() * 200) + 50   // 4x conversions!
    });
  }
  schedulePersist();
}
