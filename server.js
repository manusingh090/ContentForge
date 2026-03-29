import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const multer = require('multer');
const pdfParse = require('pdf-parse');
const officeParser = require('officeparser');

import {
  getAllContentItems, getContentItem, getAnalytics,
  getFeedbackHistory, seedDemoData, getKnowledgeBase, getBrandGuidelines, injectVideoOutperformanceData,
  recordIntelligenceAnalysis, flushPersist
} from './data/store.js';
import { startPipeline, handleApproval, getPipelineStatus } from './pipeline/orchestrator.js';
import { runIntelligence } from './agents/intelligence.js';
import { getLearningsSummary } from './pipeline/feedback.js';
import { scrapePostMetrics } from './agents/scraper.js';
import { chatWithSupervisor } from './agents/supervisor.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

const upload = multer({ storage: multer.memoryStorage() });

// Seed demo engagement data
// seedDemoData(); // Removed to start with 0 analytics

// ==================== API ROUTES ====================

// --- Health Check ---
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    system: 'ContentForge',
    version: '1.0.0',
    agents: ['Drafter', 'Compliance Reviewer', 'Localizer', 'Publisher', 'Content Intelligence'],
    timestamp: new Date().toISOString()
  });
});

// --- Content Pipeline ---

// Extract text from uploaded documents
app.post('/api/extract-text', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const buffer = req.file.buffer;
    const originalName = req.file.originalname.toLowerCase();
    let text = '';

    if (originalName.endsWith('.pdf')) {
      const data = await pdfParse(buffer);
      text = data.text;
    } else if (originalName.endsWith('.pptx') || originalName.endsWith('.docx')) {
      const ast = await officeParser.parseOffice(buffer);
      text = ast.toText();
    } else if (originalName.endsWith('.txt')) {
      text = buffer.toString('utf8');
    } else {
      return res.status(400).json({ error: 'Unsupported file type. Use .txt, .pdf, .docx, or .pptx.' });
    }

    res.json({ success: true, data: { text: text.trim(), filename: req.file.originalname } });
  } catch (err) {
    console.error('File extraction error:', err);
    res.status(500).json({ error: 'Failed to extract text from file: ' + err.message });
  }
});

// AI Magic Auto-Fill for the Create Content brevity form
app.post('/api/magic-fill', async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

    const systemPrompt = `You are an AI assistant that extracts content brief information from user requests.
Extract the following fields from the user's prompt:
- topic (string): The main subject
- format (string): One of: blog_post, social_media, email_newsletter, sales_collateral, press_release, product_launch_sprint
- audience (string): One of: general business professionals, C-suite executives and decision makers, technical developers and engineers, marketing and sales teams, general consumers
- tone (string): One of: professional yet approachable, formal and authoritative, casual and friendly, inspirational and visionary, data-driven and analytical
- keyMessages (string): Any specific points or themes to include, separated by newlines
- instructions (string): Any specific constraints, bans, or formatting rules mentioned

If a field is not explicitly mentioned, use your best judgment to pick the most appropriate default from the allowed values.

OUTPUT JSON FORMAT:
{
  "topic": "string",
  "format": "string",
  "audience": "string",
  "tone": "string",
  "keyMessages": "string",
  "instructions": "string"
}`;

    const { callGroq } = await import('./agents/groq.js');
    const result = await callGroq(systemPrompt + "\n\nUSER PROMPT: " + prompt);
    
    if (result.success && result.parsed) {
      res.json({ success: true, data: result.parsed });
    } else {
      res.status(500).json({ error: 'Failed to extract brief' });
    }
  } catch (error) {
    console.error('Magic Fill error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Start a new content pipeline
app.post('/api/pipeline/start', async (req, res) => {
  try {
    const brief = req.body;
    if (!brief.topic) {
      return res.status(400).json({ error: 'Content brief must include a topic' });
    }

    // Set defaults
    brief.format = brief.format || 'blog_post';
    brief.audience = brief.audience || 'general business professionals';
    brief.tone = brief.tone || 'professional yet approachable';
    brief.channels = brief.channels || ['blog', 'twitter', 'linkedin', 'email'];
    brief.locales = brief.locales || [
      { code: 'hi-IN', name: 'Hindi (India)', region: 'India' },
      { code: 'ta-IN', name: 'Tamil (India)', region: 'India' }
    ];

    const result = await startPipeline(brief);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Pipeline start error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Handle stage approval/rejection
app.post('/api/pipeline/:contentId/approve', async (req, res) => {
  try {
    const { contentId } = req.params;
    const { stage, action, feedback, modifiedContent } = req.body;

    if (!stage || !action) {
      return res.status(400).json({ error: 'Stage and action are required' });
    }

    if (!['approved', 'rejected', 'revision_requested'].includes(action)) {
      return res.status(400).json({ error: 'Action must be approved, rejected, or revision_requested' });
    }

    const result = await handleApproval(contentId, stage, action, feedback, modifiedContent);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Approval error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Retry a failed pipeline stage
app.post('/api/pipeline/:contentId/retry', async (req, res) => {
  try {
    const { contentId } = req.params;
    const { stage } = req.body;
    if (!stage) {
      return res.status(400).json({ error: 'Stage is required' });
    }

    const { retryStage } = await import('./pipeline/orchestrator.js');
    const result = await retryStage(contentId, stage);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Retry error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get pipeline status for a content item
app.get('/api/pipeline/:contentId/status', (req, res) => {
  try {
    const status = getPipelineStatus(req.params.contentId);
    if (!status) {
      return res.status(404).json({ error: 'Content item not found' });
    }
    res.json({ success: true, data: status });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Content Items ---

// Get all content items
app.get('/api/content', (req, res) => {
  try {
    const items = getAllContentItems();
    res.json({ success: true, data: items });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single content item
app.get('/api/content/:id', (req, res) => {
  try {
    const item = getContentItem(req.params.id);
    if (!item) {
      return res.status(404).json({ error: 'Content item not found' });
    }
    res.json({ success: true, data: item });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Analytics ---

app.get('/api/analytics', (req, res) => {
  try {
    const analytics = getAnalytics();
    res.json({ success: true, data: analytics });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/analytics/input', (req, res) => {
  try {
    const { channel, views, clicks, shares, conversions, contentId, contentTitle } = req.body;
    if (!channel) {
      return res.status(400).json({ error: 'Channel is required' });
    }
    
    // Using an existing function or directly adding it
    import('./data/store.js').then(module => {
       module.recordEngagement({
         channel,
         contentId: contentId || null,
         contentTitle: contentTitle || null,
         date: new Date().toISOString().split('T')[0],
         views: Number(views) || 0,
         clicks: Number(clicks) || 0,
         shares: Number(shares) || 0,
         conversions: Number(conversions) || 0
       });
       res.json({ success: true, message: 'Analytics data added successfully.' });
    }).catch(err => {
       res.status(500).json({ error: err.message });
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/analytics/scrape', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    const result = await scrapePostMetrics(url);
    if (!result.success) {
      return res.status(500).json({ error: result.error || 'Failed to scrape url' });
    }
    
    res.json({ success: true, data: result.stats });
  } catch (error) {
    console.error('Scrape endpoint error:', error);
    res.status(500).json({ error: error.message });
  }
});

// --- Content Intelligence ---

app.post('/api/intelligence/analyze', async (req, res) => {
  try {
    const analytics = getAnalytics();
    const history = analytics.intelligenceHistory || [];
    const result = await runIntelligence(analytics.engagementData, req.body.currentStrategy, history);
    
    if (result && result.success) {
      recordIntelligenceAnalysis(result.data);
    }
    
    res.json({ success: true, data: result.data });
  } catch (error) {
    console.error('Intelligence error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/intelligence/inject-video-data', (req, res) => {
  try {
    injectVideoOutperformanceData();
    res.json({ success: true, message: "Video engagement data successfully injected (4x outperformance)." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/chat', async (req, res) => {
  try {
    const { prompt, history } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });
    
    const response = await chatWithSupervisor(prompt, history);
    res.json(response);
  } catch(error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: error.message });
  }
});

// --- Knowledge Base ---

app.get('/api/knowledge', (req, res) => {
  try {
    const kb = getKnowledgeBase();
    res.json({ success: true, data: kb });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Brand Guidelines ---

app.get('/api/brand-guidelines', (req, res) => {
  try {
    const guidelines = getBrandGuidelines();
    res.json({ success: true, data: guidelines });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/brand-guidelines', async (req, res) => {
  try {
    const module = await import('./data/store.js');
    const updated = module.updateBrandGuidelines(req.body);
    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Feedback & Learnings ---

app.get('/api/feedback', (req, res) => {
  try {
    const history = getFeedbackHistory();
    res.json({ success: true, data: history });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/feedback/learnings/:stage', (req, res) => {
  try {
    const learnings = getLearningsSummary(req.params.stage);
    res.json({ success: true, data: learnings });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Serve frontend for all other routes ---
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

function shutdownPersist() {
  try {
    flushPersist();
  } catch (_) {
    /* ignore */
  }
}
process.on('SIGINT', () => {
  shutdownPersist();
  process.exit(0);
});
process.on('SIGTERM', () => {
  shutdownPersist();
  process.exit(0);
});

// ==================== START SERVER ====================
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════╗
║         ContentForge AI System               ║
║         Enterprise Content Operations        ║
╠══════════════════════════════════════════════╣
║  Server running on http://localhost:${PORT}      ║
║                                              ║
║  Agents:                                     ║
║  ├── 📝 Drafter Agent                        ║
║  ├── ✅ Compliance Reviewer Agent            ║
║  ├── 🌐 Localizer Agent                      ║
║  ├── 📢 Publisher Agent                      ║
║  └── 📊 Content Intelligence Agent           ║
║                                              ║
║  Pipeline: Draft → Review → Localize → Pub  ║
╚══════════════════════════════════════════════╝
  `);
});
