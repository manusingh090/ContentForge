/**
 * ContentForge — Frontend Application
 * Main controller for routing, API calls, pipeline visualization, and approval gates.
 */

const API_BASE = '';

/** Labels for the live agent strip, roster highlights, and pipeline cards */
const PIPELINE_AGENT_META = {
  drafting: { name: 'Drafter', verb: 'Writing your draft', iconId: 'pencil' },
  review: { name: 'Compliance reviewer', verb: 'Running compliance review', iconId: 'check-circle' },
  localization: { name: 'Localizer', verb: 'Localizing your content', iconId: 'globe' },
  publishing: { name: 'Publisher', verb: 'Preparing channel outputs', iconId: 'megaphone' },
  intelligence: { name: 'Intelligence', verb: 'Analyzing engagement data', iconId: 'activity' }
};

class ContentForgeApp {
  constructor() {
    this.currentSection = 'dashboard';
    this.contentItems = [];
    this.analytics = null;
    this._intelligenceBusy = false;
    this.init();
  }

  init() {
    this.setupNavigation();
    this.setupForm();
    this.setupTheme();
    this.loadDashboard();
    this.startPolling();
  }

  // ===== Theme =====
  setupTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    const sun = document.getElementById('themeIconSun');
    const moon = document.getElementById('themeIconMoon');
    if (savedTheme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
      if (sun) sun.hidden = false;
      if (moon) moon.hidden = true;
    } else {
      document.documentElement.removeAttribute('data-theme');
      if (sun) sun.hidden = true;
      if (moon) moon.hidden = false;
    }
  }

  toggleTheme() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const sun = document.getElementById('themeIconSun');
    const moon = document.getElementById('themeIconMoon');
    if (isDark) {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('theme', 'light');
      if (sun) sun.hidden = true;
      if (moon) moon.hidden = false;
    } else {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('theme', 'dark');
      if (sun) sun.hidden = false;
      if (moon) moon.hidden = true;
    }
  }

  // ===== Navigation =====
  setupNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const section = item.dataset.section;
        this.navigateTo(section);
      });
    });
  }

  navigateTo(section) {
    const prevSection = this.currentSection;
    // Update nav active state
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const navItem = document.querySelector(`[data-section="${section}"]`);
    if (navItem) navItem.classList.add('active');

    // Update sections
    document.querySelectorAll('.content-section').forEach(s => {
      s.classList.remove('active');
      s.classList.remove('section-enter');
    });
    const target = document.getElementById(`section-${section}`);
    if (target) {
      if (prevSection !== section) {
        void target.offsetWidth;
        target.classList.add('section-enter');
      }
      target.classList.add('active');
    }

    // Update topbar
    const titles = {
      dashboard: ['Dashboard', 'Overview of your content operations'],
      create: ['Create Content', 'Define your content brief and start the AI pipeline'],
      pipeline: ['Pipeline', 'Track content through each processing stage'],
      library: ['Content Library', 'All your content pieces in one place'],
      analytics: ['Analytics', 'Engagement data and performance metrics'],
      intelligence: ['AI Insights', 'AI-powered strategy recommendations'],
      brand: ['Brand Monitor', 'Brand governance rules and compliance']
    };

    const [title, subtitle] = titles[section] || ['', ''];
    document.getElementById('pageTitle').textContent = title;
    document.getElementById('pageSubtitle').textContent = subtitle;

    this.currentSection = section;

    // Load section data
    if (section === 'dashboard') this.loadDashboard();
    else if (section === 'pipeline') this.loadPipeline();
    else if (section === 'library') this.loadLibrary();
    else if (section === 'analytics') this.loadAnalytics();
    else if (section === 'brand') this.loadBrandMonitor();
  }

  // ===== Form Setup =====
  setupForm() {
    const form = document.getElementById('contentBriefForm');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.startContentPipeline();
      });
    }
    this.setupTextareas();
  }

  setupTextareas() {
    document.body.addEventListener('input', (e) => {
      if (e.target.tagName.toLowerCase() === 'textarea') {
        e.target.style.height = 'auto';
        e.target.style.height = (e.target.scrollHeight) + 'px';
      }
    });
  }

  // ===== File Uploading =====
  async handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const loader = document.getElementById('fileUploadLoader');
    const docInput = document.getElementById('briefSupportingDoc');
    
    loader.style.display = 'flex';
    
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`${API_BASE}/api/extract-text`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();

      if (data.success && data.data && data.data.text) {
        // Append text if there's already some, or replace it
        if (docInput.value) {
          docInput.value += '\\n\\n--- [' + file.name + '] ---\\n\\n' + data.data.text;
        } else {
          docInput.value = '--- [' + file.name + '] ---\\n\\n' + data.data.text;
        }
        
        // Dispatch input event so it auto-resizes
        docInput.dispatchEvent(new Event('input', { bubbles: true }));
        this.showToast('File extracted successfully!', 'success');
      } else {
        this.showToast('Failed to extract text: ' + (data.error || 'Unknown error'), 'error');
      }
    } catch (err) {
      this.showToast(`Error: ${err.message}`, 'error');
    } finally {
      loader.style.display = 'none';
      event.target.value = ''; // Reset file input so they can upload the same file again if needed
    }
  }

  // ===== Magic AI Auto-Fill =====
  async magicAutoFill() {
    const inputEl = document.getElementById('aiAutoFillInput');
    const prompt = inputEl.value.trim();
    if (!prompt) {
      this.showToast('Please paste some text or instructions first!', 'error');
      return;
    }

    const btn = document.getElementById('btnAutoFill');
    const txt = document.getElementById('autoFillText');
    const loader = document.getElementById('autoFillLoader');

    btn.disabled = true;
    txt.style.display = 'none';
    loader.style.display = 'block';

    try {
      const res = await fetch(`${API_BASE}/api/magic-fill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      });
      const data = await res.json();

      if (data.success && data.data) {
        const brief = data.data;
        if (brief.topic) document.getElementById('briefTopic').value = brief.topic;
        if (brief.format) document.getElementById('briefFormat').value = brief.format;
        if (brief.audience) document.getElementById('briefAudience').value = brief.audience;
        if (brief.tone) document.getElementById('briefTone').value = brief.tone;
        if (brief.keyMessages) document.getElementById('briefKeyMessages').value = brief.keyMessages;
        if (brief.instructions) document.getElementById('briefInstructions').value = brief.instructions;
        
        this.showToast('Form auto-filled by AI.', 'success');
        
        // Optionally auto-start if it feels appropriate, but letting them review is safer.
      } else {
        this.showToast('Could not extract details from that text.', 'error');
      }
    } catch (err) {
      this.showToast(`Error: ${err.message}`, 'error');
    } finally {
      btn.disabled = false;
      txt.style.display = 'block';
      loader.style.display = 'none';
    }
  }

  // ===== Start Content Pipeline =====
  async startContentPipeline() {
    const btn = document.getElementById('startPipelineBtn');
    const btnText = btn.querySelector('.btn-text');
    const btnLoader = btn.querySelector('.btn-loader');

    // Gather form data
    const topic = document.getElementById('briefTopic').value.trim();
    if (!topic) {
      this.showToast('Please enter a topic', 'error');
      return;
    }

    const channels = [];
    document.querySelectorAll('#contentBriefForm .checkbox-group')[0]
      .querySelectorAll('input[type="checkbox"]:checked')
      .forEach(cb => channels.push(cb.value));

    const locales = [];
    document.querySelectorAll('#contentBriefForm .checkbox-group')[1]
      .querySelectorAll('input[type="checkbox"]:checked')
      .forEach(cb => {
        const loc = { code: cb.value, name: cb.dataset.name };
        if (cb.dataset.region) loc.region = cb.dataset.region;
        locales.push(loc);
      });

    const brief = {
      topic,
      format: document.getElementById('briefFormat').value,
      audience: document.getElementById('briefAudience').value,
      tone: document.getElementById('briefTone').value,
      wordCount: document.getElementById('briefWordCount').value,
      supportingDocument: document.getElementById('briefSupportingDoc')?.value || '',
      keyMessages: document.getElementById('briefKeyMessages').value,
      instructions: document.getElementById('briefInstructions').value,
      channels,
      locales
    };

    // Show loading
    btnText.style.display = 'none';
    btnLoader.style.display = 'flex';
    btn.disabled = true;

    try {
      const res = await fetch(`${API_BASE}/api/pipeline/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(brief)
      });
      const data = await res.json();

      if (data.success) {
        this.showToast('Pipeline started — Drafter is generating your content.', 'success');
        // Navigate to pipeline view
        this.navigateTo('pipeline');
        // Reset form
        document.getElementById('briefTopic').value = '';
        const docInput = document.getElementById('briefSupportingDoc');
        if (docInput) docInput.value = '';
        document.getElementById('briefKeyMessages').value = '';
        document.getElementById('briefInstructions').value = '';
        document.getElementById('aiAutoFillInput').value = '';
        // Rapid-poll so the user sees the draft appear quickly
        this._startRapidPoll();
      } else {
        this.showToast(`Error: ${data.error}`, 'error');
      }
    } catch (err) {
      this.showToast(`Network error: ${err.message}`, 'error');
    } finally {
      btnText.style.display = 'flex';
      btnLoader.style.display = 'none';
      btn.disabled = false;
    }
  }

  // ===== Load Dashboard =====
  async loadDashboard() {
    try {
      const [analyticsRes, contentRes] = await Promise.all([
        fetch(`${API_BASE}/api/analytics`),
        fetch(`${API_BASE}/api/content`)
      ]);
      const analyticsData = await analyticsRes.json();
      const contentData = await contentRes.json();

      if (analyticsData.success) {
        this.analytics = analyticsData.data;
        this.updateMetrics(analyticsData.data);
        this.updateChannelDistribution(analyticsData.data.channelDistribution);
      }

      if (contentData.success) {
        this.contentItems = contentData.data;
        this.updateRecentActivity(contentData.data);
      }
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      this.syncAgentActivityUI();
    }
  }

  updateMetrics(analytics) {
    this._lastAnalytics = analytics;
    document.getElementById('metricCreated').textContent = analytics.totalContentCreated;
    document.getElementById('metricApproved').textContent = analytics.totalApproved;
    document.getElementById('metricCycleTime').textContent = analytics.averageCycleTimeFormatted || '--';
    document.getElementById('metricCompliance').textContent = analytics.averageComplianceScore
      ? `${analytics.averageComplianceScore}%` : '--';
    document.getElementById('avgCycleTime').textContent = analytics.averageCycleTimeFormatted || '--';
  }

  showCycleTimeBreakdown() {
    const analytics = this._lastAnalytics;
    const cycleTimes = analytics?.recentCycleTimes || [];

    if (cycleTimes.length === 0) {
      this.showToast('No cycle time data yet. Complete a pipeline to see breakdown.', 'info');
      return;
    }

    const formatDur = (ms) => {
      if (!ms) return '0s';
      const s = Math.floor(ms / 1000);
      const m = Math.floor(s / 60);
      const h = Math.floor(m / 60);
      if (h > 0) return `${h}h ${m % 60}m ${s % 60}s`;
      if (m > 0) return `${m}m ${s % 60}s`;
      return `${s}s`;
    };

    const totalMs = cycleTimes.reduce((sum, ct) => sum + ct.durationMs, 0);
    const avgMs = totalMs / cycleTimes.length;
    const fastest = Math.min(...cycleTimes.map(ct => ct.durationMs));
    const slowest = Math.max(...cycleTimes.map(ct => ct.durationMs));

    const rows = cycleTimes.map((ct, i) => {
      const pct = slowest > 0 ? (ct.durationMs / slowest) * 100 : 0;
      const isMax = ct.durationMs === slowest;
      const isMin = ct.durationMs === fastest;
      const badge = isMax ? '<span style="color:#ef4444; font-size:0.7rem; margin-left:4px;">▲ Slowest</span>' :
                    isMin ? '<span style="color:#10b981; font-size:0.7rem; margin-left:4px;">▼ Fastest</span>' : '';
      return `<tr style="border-bottom:1px solid var(--border-color);">
        <td style="padding:10px; font-weight:500; max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${this.escapeHtml(ct.title || 'Untitled')}</td>
        <td style="padding:10px; width:200px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <div style="flex:1; background:var(--border-color); border-radius:4px; height:8px; overflow:hidden;">
              <div style="width:${pct}%; height:100%; background:linear-gradient(90deg, var(--accent-indigo), var(--accent-purple)); border-radius:4px; transition:width 0.5s;"></div>
            </div>
            <span style="font-weight:600; font-size:0.85rem; white-space:nowrap;">${formatDur(ct.durationMs)}</span>
          </div>
        </td>
        <td style="padding:10px; font-size:0.8rem; color:var(--text-muted); white-space:nowrap;">${new Date(ct.timestamp).toLocaleString()}${badge}</td>
      </tr>`;
    }).join('');

    const modalHtml = `
      <div class="modal-overlay active" id="cycleTimeModal" onclick="if(event.target===this)this.remove()">
        <div class="modal" style="max-width:700px; width:90%;">
          <div class="modal-header" style="display:flex; justify-content:space-between; align-items:center; padding:16px 20px; border-bottom:1px solid var(--border-color);">
            <h3 style="margin:0; display:flex; align-items:center; gap:8px;">${cfIcon('clock', 'icon--sm')} Pipeline Cycle Time Breakdown</h3>
            <button type="button" onclick="document.getElementById('cycleTimeModal').remove()" class="btn btn-secondary btn-sm">${cfIcon('x', 'icon--btn')}</button>
          </div>
          <div class="modal-body" style="padding:20px;">
            <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-bottom:20px;">
              <div style="background:rgba(99,102,241,0.08); padding:12px; border-radius:8px; text-align:center;">
                <div style="font-size:1.5rem; font-weight:700; color:var(--accent-indigo);">${formatDur(avgMs)}</div>
                <div style="font-size:0.75rem; color:var(--text-muted);">Average</div>
              </div>
              <div style="background:rgba(16,185,129,0.08); padding:12px; border-radius:8px; text-align:center;">
                <div style="font-size:1.5rem; font-weight:700; color:var(--accent-emerald);">${formatDur(fastest)}</div>
                <div style="font-size:0.75rem; color:var(--text-muted);">Fastest</div>
              </div>
              <div style="background:rgba(239,68,68,0.08); padding:12px; border-radius:8px; text-align:center;">
                <div style="font-size:1.5rem; font-weight:700; color:#ef4444;">${formatDur(slowest)}</div>
                <div style="font-size:0.75rem; color:var(--text-muted);">Slowest</div>
              </div>
            </div>
            <div style="overflow-x:auto;">
              <table style="width:100%; border-collapse:collapse;">
                <thead>
                  <tr style="border-bottom:2px solid var(--border-color); font-size:0.8rem; color:var(--text-muted);">
                    <th style="padding:8px 10px; text-align:left;">Content</th>
                    <th style="padding:8px 10px; text-align:left;">Duration</th>
                    <th style="padding:8px 10px; text-align:left;">Completed</th>
                  </tr>
                </thead>
                <tbody>${rows}</tbody>
              </table>
            </div>
            <div style="margin-top:16px; font-size:0.78rem; color:var(--text-muted); text-align:center;">
              ${cycleTimes.length} pipeline${cycleTimes.length !== 1 ? 's' : ''} completed · Total time: ${formatDur(totalMs)}
            </div>
          </div>
        </div>
      </div>`;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
  }

  updateChannelDistribution(distribution) {
    const total = Object.values(distribution).reduce((a, b) => a + b, 0) || 1;
    const channels = ['blog', 'twitter', 'linkedin', 'email', 'youtube'];
    channels.forEach(ch => {
      const pct = (distribution[ch] / total) * 100;
      const barEl = document.getElementById(`bar${ch.charAt(0).toUpperCase() + ch.slice(1)}`);
      const countEl = document.getElementById(`count${ch.charAt(0).toUpperCase() + ch.slice(1)}`);
      if (barEl) barEl.style.width = `${pct}%`;
      if (countEl) countEl.textContent = distribution[ch];
    });
  }

  updateRecentActivity(items) {
    const container = document.getElementById('recentActivity');
    if (items.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon-wrap" aria-hidden="true">${cfIcon('rocket', 'icon--empty')}</span>
          <p>No content created yet. Start by creating your first content piece!</p>
          <button class="btn btn-primary" onclick="app.navigateTo('create')">Create Content</button>
        </div>`;
      return;
    }

    container.innerHTML = `<div class="activity-list">
      ${items.slice(0, 8).map(item => `
        <div class="activity-item" onclick="app.viewContentDetail('${item.id}')">
          <div class="activity-icon">${this.getStageIcon(item.currentStage)}</div>
          <div class="activity-info">
            <div class="activity-title">${this.escapeHtml(item.content?.title || item.brief?.topic || 'Untitled')}</div>
            <div class="activity-meta">${item.brief?.format || 'content'} · ${this.timeAgo(item.createdAt)}</div>
          </div>
          <div class="activity-status">
            <span class="library-item-status ${this.getStatusClass(item.status)}">${this.formatStatus(item.status)}</span>
          </div>
        </div>
      `).join('')}
    </div>`;
  }

  // ===== Load Pipeline =====
  async loadPipeline() {
    try {
      const container = document.getElementById('pipelineContainer');

      // Skip re-render if user is actively typing in an input
      const activeEl = document.activeElement;
      if (activeEl && activeEl.id && (activeEl.id.startsWith('feedback-') || activeEl.id.startsWith('edit-content-'))) {
        return; // Don't destroy the input while user is typing
      }

      // Save existing values before re-render
      const savedFeedback = {};
      const savedEdits = {};
      const savedChecks = [];

      container.querySelectorAll('input[id^="feedback-"]').forEach(input => {
        if (input.value) savedFeedback[input.id] = input.value;
      });
      container.querySelectorAll('textarea[id^="edit-content-"]').forEach(textarea => {
        savedEdits[textarea.id] = textarea.value;
      });
      container.querySelectorAll('.issue-checkbox:checked').forEach(cb => {
        if (cb.id) savedChecks.push(cb.id);
      });

      const res = await fetch(`${API_BASE}/api/content`);
      const data = await res.json();

      if (!data.success || data.data.length === 0) {
        this.contentItems = [];
        container.innerHTML = `
          <div class="empty-state">
            <span class="empty-icon-wrap" aria-hidden="true">${cfIcon('pipeline', 'icon--empty')}</span>
            <p>No active pipelines. Create content to see the pipeline in action.</p>
            <button class="btn btn-primary" onclick="app.navigateTo('create')">Create Content</button>
          </div>`;
      } else {
        this.contentItems = data.data;

        const recentItems = data.data.slice(0, 5);
        let html = '';

        for (const item of recentItems) {
          const statusRes = await fetch(`${API_BASE}/api/pipeline/${item.id}/status`);
          const statusData = await statusRes.json();
          const status = statusData.success ? statusData.data : null;

          html += this.renderPipelineItem(item, status);
        }

        container.innerHTML = html;

        // Restore saved values
        for (const [id, value] of Object.entries(savedFeedback)) {
          const input = document.getElementById(id);
          if (input) input.value = value;
        }
        for (const [id, value] of Object.entries(savedEdits)) {
          const textarea = document.getElementById(id);
          if (textarea) textarea.value = value;
        }
        savedChecks.forEach(id => {
          const cb = document.getElementById(id);
          if (cb) cb.checked = true;
        });
      }
    } catch (err) {
      console.error('Pipeline load error:', err);
    } finally {
      this.syncAgentActivityUI();
    }
  }

  renderPipelineItem(item, status) {
    const stages = [
      { key: 'drafting', iconId: 'pencil', label: 'Draft' },
      { key: 'review', iconId: 'check-circle', label: 'Review' },
      { key: 'localization', iconId: 'globe', label: 'Localize' },
      { key: 'publishing', iconId: 'megaphone', label: 'Publish' }
    ];

    const completedCount = stages.filter(s =>
      ['approved', 'completed'].includes(item.stages[s.key]?.status)
    ).length;
    const progressWidth = status ? (completedCount / stages.length) * 100 : 0;
    const workingStage = this.getWorkingStageForItem(item);
    const activeAgentBanner = workingStage ? this.renderPipelineActiveBanner(workingStage, item) : '';

    let html = `
    <div class="card" style="margin-bottom: 20px;">
      <div class="card-header">
        <h3>${this.escapeHtml(item.content?.title || item.brief?.topic || 'Untitled')}</h3>
        <span class="library-item-status ${this.getStatusClass(item.status)}">${this.formatStatus(item.status)}</span>
      </div>
      <div class="card-body">
        ${activeAgentBanner}
        <div class="pipeline-visual">
          <div class="pipeline-stages">
            <div class="pipeline-progress-line" style="width: ${progressWidth}%"></div>
            ${stages.map(s => {
              const stageData = item.stages[s.key];
              const stageStatus = stageData?.status || 'pending';
              return `
                <div class="pipeline-stage">
                  <div class="stage-circle ${stageStatus}">${cfIcon(s.iconId, 'icon--stage')}</div>
                  <span class="stage-label">${s.label}</span>
                  <span class="stage-status-text">${this.formatStageStatus(stageStatus)}</span>
                </div>`;
            }).join('')}
          </div>
        </div>
        ${status ? `<div style="font-size:0.82rem; color:var(--text-muted); margin-bottom:12px;">Elapsed: ${status.totalElapsed} · Progress: ${status.progress}%</div>` : ''}
        ${this.renderApprovalGate(item)}
        ${this.renderFailedStage(item)}
      </div>
    </div>`;

    return html;
  }

  renderPipelineActiveBanner(stage, item) {
    const meta = PIPELINE_AGENT_META[stage];
    if (!meta || typeof cfIcon !== 'function') return '';
    const raw = item.brief?.topic || item.content?.title || 'Untitled';
    const topic = this.escapeHtml(this.truncateText(raw, 80));
    return `<div class="pipeline-active-agent">${cfIcon(meta.iconId, 'icon--sm')}<span><strong>${this.escapeHtml(meta.name)}</strong> — ${this.escapeHtml(meta.verb)} · <span style="color:var(--text-muted); font-style:italic;">${topic}</span></span></div>`;
  }

  renderApprovalGate(item) {
    const currentStage = item.currentStage;
    const stageData = item.stages[currentStage];

    if (!stageData || stageData.status !== 'awaiting_approval') return '';

    let contentPreview = '';
    let extraInfo = '';

    if (currentStage === 'drafting' && item.content) {
      contentPreview = `
        <h4 style="margin-bottom:8px;">${this.escapeHtml(item.content.title)}</h4>
        <div class="approval-content-preview">${this.escapeHtml(item.content.content || '')}</div>
        ${item.content.metadata ? `<div style="font-size:0.78rem; color:var(--text-muted); margin-bottom:12px;">
          ${item.content.metadata.wordCount || ''} words · ${item.content.metadata.readingTime || ''} · Keywords: ${(item.content.metadata.keywords || []).join(', ')}
        </div>` : ''}`;
    }

    if (currentStage === 'review' && item.reviewFeedback) {
      const rf = item.reviewFeedback;
      contentPreview = `
        <div class="review-scores">
          <div class="review-score-item has-tooltip">
            <span class="review-score-value ${rf.overallScore >= 75 ? 'high' : rf.overallScore >= 50 ? 'medium' : 'low'}">${rf.overallScore || '--'}</span>
            <span class="review-score-label">Overall</span>
            <div class="score-tooltip">
              <div class="tooltip-title">Overall Score Logic</div>
              <div class="tooltip-body">${this.escapeHtml(rf.overallLogic || 'Score based on aggregating all sub-metrics.')}</div>
              ${rf.overallImprovement ? `<div class="tooltip-improvement"><strong>Suggestion:</strong> ${this.escapeHtml(rf.overallImprovement)}</div>` : ''}
            </div>
          </div>
          <div class="review-score-item has-tooltip">
            <span class="review-score-value ${rf.toneScore >= 75 ? 'high' : 'medium'}">${rf.toneScore || '--'}</span>
            <span class="review-score-label">Tone</span>
            <div class="score-tooltip">
              <div class="tooltip-title">Brand Tone Logic</div>
              <div class="tooltip-body">${this.escapeHtml(rf.toneLogic || 'Evaluates adherence to brand voice.')}</div>
              ${rf.toneImprovement ? `<div class="tooltip-improvement"><strong>Suggestion:</strong> ${this.escapeHtml(rf.toneImprovement)}</div>` : ''}
            </div>
          </div>
          <div class="review-score-item has-tooltip">
            <span class="review-score-value ${rf.legalScore >= 75 ? 'high' : 'medium'}">${rf.legalScore || '--'}</span>
            <span class="review-score-label">Legal</span>
            <div class="score-tooltip">
              <div class="tooltip-title">Legal Compliance Logic</div>
              <div class="tooltip-body">${this.escapeHtml(rf.legalLogic || 'Checks for regulatory violations or missing disclaimers.')}</div>
              ${rf.legalImprovement ? `<div class="tooltip-improvement"><strong>Suggestion:</strong> ${this.escapeHtml(rf.legalImprovement)}</div>` : ''}
            </div>
          </div>
          <div class="review-score-item has-tooltip">
            <span class="review-score-value ${rf.qualityScore >= 75 ? 'high' : 'medium'}">${rf.qualityScore || '--'}</span>
            <span class="review-score-label">Quality</span>
            <div class="score-tooltip">
              <div class="tooltip-title">Content Quality Logic</div>
              <div class="tooltip-body">${this.escapeHtml(rf.qualityLogic || 'Evaluates grammar, structure, and readability.')}</div>
              ${rf.qualityImprovement ? `<div class="tooltip-improvement"><strong>Suggestion:</strong> ${this.escapeHtml(rf.qualityImprovement)}</div>` : ''}
            </div>
          </div>
        </div>
        ${this.renderAnnotatedContent(item, rf)}
        ${rf.issues && rf.issues.length > 0 ? `
          <div class="issue-list">
            ${rf.issues.map((issue, idx) => `
              <div class="issue-item" style="display: flex; align-items: flex-start;">
                <input type="checkbox" id="issue-cb-${item.id}-${idx}" value="${this.escapeHtml(issue.suggestion || issue.description)}" class="issue-checkbox" style="margin-right: 12px; margin-top: 4px; flex-shrink: 0; width: 16px; height: 16px; cursor: pointer;">
                <span class="issue-severity ${issue.severity}">${issue.severity}</span>
                <div>
                  <div>${this.escapeHtml(issue.description)}</div>
                  ${issue.location ? `<div class="issue-location"><strong>Found:</strong> <em>"${this.escapeHtml(issue.location)}"</em></div>` : ''}
                  ${issue.suggestion ? `<div class="issue-suggestion"><span class="issue-suggestion-icon" aria-hidden="true">${cfIcon('bulb', 'icon--xs')}</span> ${this.escapeHtml(issue.suggestion)}</div>` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        ` : ''}
        ${rf.summary ? `<div style="font-size:0.85rem; color:var(--text-secondary); margin-bottom:12px;">${this.escapeHtml(rf.summary)}</div>` : ''}`;
    }

    if (currentStage === 'localization' && item.localizedContent) {
      const locales = Object.keys(item.localizedContent);
      if (locales.length > 0) {
        contentPreview = `
          <div class="locale-tabs">
            ${locales.map((loc, i) => `
              <button class="locale-tab ${i === 0 ? 'active' : ''}" onclick="app.showLocaleTab(this, '${item.id}', '${loc}')">${item.localizedContent[loc]?.localeName || loc}</button>
            `).join('')}
          </div>
          <div id="localeContent-${item.id}" class="approval-content-preview">${this.escapeHtml(item.localizedContent[locales[0]]?.content || 'No content')}</div>
          ${item.localizedContent[locales[0]]?.adaptationNotes ? `<div class="adaptation-notes"><span aria-hidden="true">${cfIcon('notes', 'icon--xs')}</span> ${this.escapeHtml(item.localizedContent[locales[0]].adaptationNotes)}</div>` : ''}`;
      }
    }

    if (currentStage === 'publishing' && item.publishedContent) {
      const channels = Object.keys(item.publishedContent);
      if (channels.length > 0) {
        contentPreview = `
          <div class="channel-tabs">
            ${channels.map((ch, i) => `
              <button type="button" class="channel-tab ${i === 0 ? 'active' : ''}" onclick="app.showChannelTab(this, '${item.id}', '${ch}')"><span class="channel-tab-icon" aria-hidden="true">${cfIcon(this.getChannelIconId(ch), 'icon--xs')}</span> ${ch}</button>
            `).join('')}
          </div>
          <div id="channelContent-${item.id}" class="approval-content-preview">${this.renderChannelPreview(item.publishedContent[channels[0]], channels[0])}</div>`;
      }
    }

    return `
      <div class="approval-gate">
        <div class="approval-header">
          <span class="approval-title"><span class="approval-title-icon" aria-hidden="true">${cfIcon('shield', 'icon--sm')}</span> Approval: ${this.formatStageName(currentStage)}</span>
          <span class="approval-badge awaiting">Awaiting approval</span>
        </div>
        ${contentPreview}
        <div class="approval-actions">
          <div class="approval-feedback">
            <input type="text" id="feedback-${item.id}" placeholder="Optional feedback or revision notes...">
          </div>
          <button type="button" class="btn btn-success btn-sm btn-with-icon" onclick="app.approve('${item.id}', '${currentStage}')">${cfIcon('check', 'icon--btn')} Approve</button>
          <button type="button" class="btn btn-warning btn-sm btn-with-icon" onclick="app.requestRevision('${item.id}', '${currentStage}')">${cfIcon('revise', 'icon--btn')} Revise</button>
          <button type="button" class="btn btn-danger btn-sm btn-with-icon" onclick="app.reject('${item.id}', '${currentStage}')">${cfIcon('x', 'icon--btn')} Reject</button>
        </div>
      </div>`;
  }

  renderAnnotatedContent(item, reviewFeedback) {
    const content = item.content?.content || '';
    if (!content) return '';

    const issues = reviewFeedback.issues || [];
    if (issues.length === 0) {
      // No issues — show content without highlights
      return `<div class="annotated-content-preview">
        <div class="annotated-content-header">${cfIcon('document', 'icon--sm')} <strong>Content Preview</strong> <span style="color:var(--accent-emerald); font-size:0.8rem;">✓ No violations found</span></div>
        <div class="annotated-content-body">${this.escapeHtml(content)}</div>
      </div>
      <div style="margin-top: 16px;">
        <div style="font-size: 0.85rem; font-weight: 600; color: var(--text-primary); margin-bottom: 8px;">${cfIcon('pencil', 'icon--xs')} Edit Draft Content</div>
        <textarea id="edit-content-${item.id}" style="width: 100%; min-height: 200px; padding: 12px; font-family: inherit; font-size: 0.9rem; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-color); color: var(--text-color);">${this.escapeHtml(content)}</textarea>
      </div>`;
    }

    // Build highlighted content — find and wrap flagged sentences
    let annotatedHtml = this.escapeHtml(content);
    const severityColors = {
      critical: { bg: 'rgba(239, 68, 68, 0.15)', border: '#ef4444', text: '#dc2626' },
      high: { bg: 'rgba(249, 115, 22, 0.15)', border: '#f97316', text: '#ea580c' },
      medium: { bg: 'rgba(234, 179, 8, 0.12)', border: '#eab308', text: '#ca8a04' },
      low: { bg: 'rgba(59, 130, 246, 0.1)', border: '#3b82f6', text: '#2563eb' }
    };

    // Sort by longest location first to avoid partial matches
    const issuesWithLocations = issues.filter(i => i.location && i.location.length > 10)
      .sort((a, b) => b.location.length - a.location.length);

    for (const issue of issuesWithLocations) {
      const escapedLocation = this.escapeHtml(issue.location);
      const colors = severityColors[issue.severity] || severityColors.medium;
      const tooltipText = issue.suggestion ? this.escapeHtml(issue.suggestion) : 'Review this section';
      const severityLabel = issue.severity.toUpperCase();

      const highlightedSpan = `<span class="violation-highlight" style="background:${colors.bg}; border-bottom:2px solid ${colors.border}; padding:2px 4px; border-radius:3px; position:relative; cursor:help;" title="[${severityLabel}] ${tooltipText}"><span class="violation-marker" style="background:${colors.border}; color:#fff; font-size:0.6rem; padding:1px 4px; border-radius:3px; margin-right:4px; font-weight:700;">${severityLabel}</span>${escapedLocation}</span>`;

      // Replace first occurrence
      const idx = annotatedHtml.indexOf(escapedLocation);
      if (idx !== -1) {
        annotatedHtml = annotatedHtml.substring(0, idx) + highlightedSpan + annotatedHtml.substring(idx + escapedLocation.length);
      }
    }

    const issueCount = issuesWithLocations.length;
    const criticalCount = issuesWithLocations.filter(i => i.severity === 'critical').length;
    const summaryColor = criticalCount > 0 ? 'var(--error-color, #ef4444)' : 'var(--warning-color, #f59e0b)';

    return `<div class="annotated-content-preview">
      <div class="annotated-content-header">
        ${cfIcon('document', 'icon--sm')} <strong>Content with Violations Highlighted</strong>
        <span style="color:${summaryColor}; font-size:0.8rem; margin-left:8px;">⚠ ${issueCount} issue${issueCount !== 1 ? 's' : ''} found${criticalCount > 0 ? ` (${criticalCount} critical)` : ''}</span>
      </div>
      <div class="annotated-content-body">${annotatedHtml}</div>
    </div>
    <div style="margin-top: 16px;">
      <div style="font-size: 0.85rem; font-weight: 600; color: var(--text-primary); margin-bottom: 8px; display:flex; align-items:center; gap:6px;">${cfIcon('pencil', 'icon--xs')} <strong>Manual Text Editor</strong> <span style="font-weight:400; font-size:0.75rem; color:var(--text-muted);">(Edits are saved upon Approve/Revise)</span></div>
      <textarea id="edit-content-${item.id}" style="width: 100%; min-height: 250px; padding: 12px; font-family: inherit; font-size: 0.95rem; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-color); color: var(--text-color); line-height: 1.5; resize: vertical;">${this.escapeHtml(content)}</textarea>
    </div>`;
  }

  showLocaleTab(btn, contentId, locale) {
    const item = this.contentItems.find(i => i.id === contentId);
    if (!item || !item.localizedContent[locale]) return;
    btn.parentElement.querySelectorAll('.locale-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`localeContent-${contentId}`).textContent = item.localizedContent[locale]?.content || 'No content';
  }

  showChannelTab(btn, contentId, channel) {
    const item = this.contentItems.find(i => i.id === contentId);
    if (!item || !item.publishedContent[channel]) return;
    btn.parentElement.querySelectorAll('.channel-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`channelContent-${contentId}`).innerHTML = this.renderChannelPreview(item.publishedContent[channel], channel);
  }

  renderChannelPreview(channelData, channel) {
    if (!channelData) return 'No content';
    
    let contentHtml = '';
    let shareAction = '';

    switch (channel) {
      case 'twitter':
        const tweetText = (channelData.thread || []).join('\n\n') + (channelData.hashtags ? '\n\n' + channelData.hashtags.join(' ') : '');
        contentHtml = (channelData.thread || []).map((t, i) => `<p><strong>Tweet ${i + 1}:</strong> ${this.escapeHtml(t)}</p>`).join('')
          + (channelData.hashtags ? `<p style="color:var(--accent-indigo)">${channelData.hashtags.join(' ')}</p>` : '');
        shareAction = `<a href="https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm btn-with-icon" style="margin-top:12px;">${cfIcon('twitter', 'icon--btn')} Share on X / Twitter</a>`;
        break;
      case 'email':
        const mailtoUrl = `mailto:?subject=${encodeURIComponent(channelData.subjectLine || '')}&body=${encodeURIComponent(channelData.content || channelData.previewText || '')}`;
        contentHtml = `<p><strong>Subject:</strong> ${this.escapeHtml(channelData.subjectLine || '')}</p>
          <p><strong>Preview:</strong> ${this.escapeHtml(channelData.previewText || '')}</p>
          <hr style="border-color:var(--border-color); margin:8px 0;">
          ${channelData.htmlBody || channelData.content || ''}`;
        shareAction = `<a href="${mailtoUrl}" class="btn btn-secondary btn-sm btn-with-icon" style="margin-top:12px;">${cfIcon('mail', 'icon--btn')} Create draft email</a>`;
        break;
      case 'linkedin':
        const liContent = channelData.content || JSON.stringify(channelData);
        contentHtml = this.escapeHtml(liContent);
        // LinkedIn doesn't support prefilling text via URL, so we copy to clipboard and open LinkedIn
        shareAction = `<button type="button" onclick="app.copyAndOpen('https://www.linkedin.com/feed/', \`${liContent.replace(/`/g, '\\`')}\`)" class="btn btn-secondary btn-sm btn-with-icon" style="margin-top:12px;">${cfIcon('briefcase', 'icon--btn')} Copy & open LinkedIn</button>`;
        break;
      case 'blog':
        contentHtml = `<p><strong>${this.escapeHtml(channelData.title || '')}</strong></p>
          <p style="color:var(--text-muted); font-size:0.8rem;">${this.escapeHtml(channelData.metaDescription || '')}</p>
          <hr style="border-color:var(--border-color); margin:8px 0;">
          ${channelData.content || ''}`;
        shareAction = `<button type="button" onclick="app.copyToClipboard(\`${(channelData.content || '').replace(/`/g, '\\`')}\`)" class="btn btn-secondary btn-sm btn-with-icon" style="margin-top:12px;">${cfIcon('document', 'icon--btn')} Copy HTML</button>`;
        break;
      default:
        contentHtml = this.escapeHtml(JSON.stringify(channelData, null, 2));
    }

    // Localized versions tabs
    let localeTabs = '';
    if (channelData.localizedVersions && Object.keys(channelData.localizedVersions).length > 0) {
      const locales = Object.keys(channelData.localizedVersions);
      const uid = 'lv_' + Math.random().toString(36).substring(7);
      localeTabs = `
        <div class="locale-version-tabs" style="margin-top:12px; border-top:1px solid var(--border-color); padding-top:12px;">
          <label style="font-size:0.78rem; font-weight:600; color:var(--accent-indigo); margin-bottom:6px; display:block;">${cfIcon('globe', 'icon--xs')} Regional Language Versions</label>
          <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:8px;">
            ${locales.map((loc, i) => `<button type="button" class="btn btn-outline btn-sm locale-ver-btn${i === 0 ? ' active' : ''}" data-uid="${uid}" onclick="app.showLocaleVersion(this, '${uid}', '${loc}')" style="font-size:0.75rem;">${loc}</button>`).join('')}
          </div>
          <div id="${uid}" class="locale-version-content" style="background:var(--bg-color); border:1px solid var(--border-color); border-radius:6px; padding:12px; font-size:0.85rem; max-height:200px; overflow-y:auto; white-space:pre-wrap;">
            ${this.renderLocalizedChannelContent(channelData.localizedVersions[locales[0]], channel)}
          </div>
        </div>`;
    }

    return `
      <div class="channel-preview-content">${contentHtml}</div>
      <div class="channel-share-action">${shareAction}</div>
      ${localeTabs}
    `;
  }

  renderLocalizedChannelContent(locData, channel) {
    if (!locData) return 'No localized content available';
    switch (channel) {
      case 'twitter':
        return (locData.thread || []).map((t, i) => `<strong>Tweet ${i + 1}:</strong> ${this.escapeHtml(t)}`).join('\n\n');
      case 'email':
        return `<strong>Subject:</strong> ${this.escapeHtml(locData.subjectLine || '')}\n\n${locData.htmlBody || locData.content || ''}`;
      case 'linkedin':
        return this.escapeHtml(locData.content || JSON.stringify(locData));
      case 'blog':
        return `<strong>${this.escapeHtml(locData.title || '')}</strong>\n\n${locData.content || ''}`;
      default:
        return this.escapeHtml(JSON.stringify(locData, null, 2));
    }
  }

  showLocaleVersion(btn, uid, locale) {
    // Find the channel data from the current pipeline item
    btn.closest('.locale-version-tabs').querySelectorAll('.locale-ver-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    // Find channel tab to determine channel
    const channelTabActive = btn.closest('.approval-content-preview')?.previousElementSibling?.querySelector('.channel-tab.active');
    const channel = channelTabActive?.textContent?.trim()?.toLowerCase() || 'blog';
    
    // Get published content for the item
    const item = this.contentItems.find(i => i.publishedContent);
    if (!item) return;
    const chData = item.publishedContent[channel];
    if (!chData?.localizedVersions?.[locale]) return;
    
    document.getElementById(uid).innerHTML = this.renderLocalizedChannelContent(chData.localizedVersions[locale], channel);
  }

  copyAndOpen(url, text) {
    this.copyToClipboard(text);
    setTimeout(() => window.open(url, '_blank'), 500);
  }

  copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
      this.showToast('Content copied to clipboard!', 'success');
    }).catch(err => {
      this.showToast('Failed to copy to clipboard', 'error');
    });
  }

  // ===== Approval Actions =====
  async approve(contentId, stage) {
    const feedback = document.getElementById(`feedback-${contentId}`)?.value || '';
    const modifiedContent = document.getElementById(`edit-content-${contentId}`)?.value;
    await this.submitApproval(contentId, stage, 'approved', feedback, modifiedContent);
  }

  async reject(contentId, stage) {
    const feedback = document.getElementById(`feedback-${contentId}`)?.value || '';
    const modifiedContent = document.getElementById(`edit-content-${contentId}`)?.value;
    await this.submitApproval(contentId, stage, 'rejected', feedback, modifiedContent);
  }

  async requestRevision(contentId, stage) {
    let feedback = document.getElementById(`feedback-${contentId}`)?.value || '';
    const modifiedContent = document.getElementById(`edit-content-${contentId}`)?.value;
    
    const checkboxes = document.querySelectorAll(`input[id^="issue-cb-${contentId}-"]:checked`);
    if (checkboxes.length > 0) {
      const checkedPoints = Array.from(checkboxes).map(cb => cb.value).join('\\n- ');
      feedback = (feedback ? feedback + '\\n\\n' : '') + 'Please apply the following specific fixes:\\n- ' + checkedPoints;
    }

    if (!feedback && !modifiedContent) {
      this.showToast('Please provide feedback for the revision or select issues to fix.', 'warning');
      return;
    }
    
    await this.submitApproval(contentId, stage, 'revision_requested', feedback, modifiedContent);
  }

  async submitApproval(contentId, stage, action, feedback, modifiedContent) {
    this.showToast(`Processing ${action}...`, 'info');

    try {
      const payload = { stage, action, feedback };
      if (modifiedContent) payload.modifiedContent = modifiedContent;

      const res = await fetch(`${API_BASE}/api/pipeline/${contentId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (data.success) {
        const actionText = action === 'approved' ? 'approved' : action === 'rejected' ? 'rejected' : 'sent for revision';
        this.showToast(`Content ${actionText} at ${this.formatStageName(stage)} stage!`, action === 'approved' ? 'success' : action === 'rejected' ? 'error' : 'warning');

        // Refresh
        await this.loadPipeline();
        this.loadDashboard();
      } else {
        this.showToast(`Error: ${data.error}`, 'error');
      }
    } catch (err) {
      this.showToast(`Network error: ${err.message}`, 'error');
    }
  }

  // ===== Content Library =====
  async loadLibrary() {
    try {
      const res = await fetch(`${API_BASE}/api/content`);
      const data = await res.json();

      const container = document.getElementById('libraryContainer');

      if (!data.success || data.data.length === 0) {
        this.contentItems = [];
        container.innerHTML = `
          <div class="empty-state">
            <span class="empty-icon-wrap" aria-hidden="true">${cfIcon('library', 'icon--empty')}</span>
            <p>Your content library is empty.</p>
            <button class="btn btn-primary" onclick="app.navigateTo('create')">Create Content</button>
          </div>`;
      } else {
        this.contentItems = data.data;

        container.innerHTML = `
        <div class="library-grid">
          ${data.data.map(item => {
            const channels = item.brief?.channels || [];
            const isCompleted = item.status === 'completed';
            const shareButtons = isCompleted && channels.length > 0 ? `
              <div class="library-share-row" onclick="event.stopPropagation();">
                ${channels.includes('twitter') ? `<a href="https://twitter.com/intent/tweet?text=${encodeURIComponent((item.content?.summary || item.content?.title || '') + ' #content')}" target="_blank" rel="noopener" class="library-share-btn" style="color:#1DA1F2;" title="Share on X">${cfIcon('twitter', 'icon--xs')}</a>` : ''}
                ${channels.includes('linkedin') ? `<button type="button" class="library-share-btn" style="color:#0A66C2;" title="Copy & open LinkedIn" onclick="app.copyAndOpen('https://www.linkedin.com/feed/', '${(item.content?.summary || item.content?.title || '').replace(/'/g, "\\'")}')">${cfIcon('briefcase', 'icon--xs')}</button>` : ''}
                ${channels.includes('email') ? `<a href="mailto:?subject=${encodeURIComponent(item.content?.title || '')}&body=${encodeURIComponent(item.content?.summary || '')}" class="library-share-btn" style="color:#f59e0b;" title="Share via Email">${cfIcon('mail', 'icon--xs')}</a>` : ''}
                ${channels.includes('blog') ? `<button type="button" class="library-share-btn" style="color:#6366f1;" title="Copy content" onclick="app.copyToClipboard('${(item.content?.content || '').replace(/'/g, "\\'").replace(/\n/g, '\\n')}')">${cfIcon('document', 'icon--xs')}</button>` : ''}
              </div>` : '';
            return `
            <div class="library-item" onclick="app.viewContentDetail('${item.id}')">
              <div class="library-item-title">${this.escapeHtml(item.content?.title || item.brief?.topic || 'Untitled')}</div>
              <div class="library-item-meta">
                <span>${item.brief?.format || 'content'}</span>
                <span>${this.timeAgo(item.createdAt)}</span>
              </div>
              <span class="library-item-status ${this.getStatusClass(item.status)}">${this.formatStatus(item.status)}</span>
              ${shareButtons}
            </div>`;
          }).join('')}
        </div>`;
      }
    } catch (err) {
      console.error('Library load error:', err);
    } finally {
      this.syncAgentActivityUI();
    }
  }

  // ===== Content Detail Modal =====
  async viewContentDetail(contentId) {
    let item = this.contentItems.find(i => i.id === contentId);
    if (!item) {
      try {
        const res = await fetch(`${API_BASE}/api/content/${contentId}`);
        const data = await res.json();
        if (data.success && data.data) {
          item = data.data;
          const exists = this.contentItems.some(i => i.id === item.id);
          if (!exists) this.contentItems.push(item);
        }
      } catch (e) {
        console.error('Failed to load content:', e);
      }
    }
    if (!item) {
      this.showToast('Could not load this content. Try refreshing the page.', 'warning');
      return;
    }

    const modal = document.getElementById('modalContent');
    modal.innerHTML = `
      <div class="modal-header">
        <h3>${this.escapeHtml(item.content?.title || item.brief?.topic || 'Untitled')}</h3>
        <button class="modal-close" onclick="app.closeModal()">&times;</button>
      </div>
      <div class="modal-body">
        <div style="margin-bottom:16px;">
          <span class="library-item-status ${this.getStatusClass(item.status)}">${this.formatStatus(item.status)}</span>
          <span style="font-size:0.82rem; color:var(--text-muted); margin-left:12px;">Created ${this.timeAgo(item.createdAt)}</span>
        </div>

        ${item.content ? `
          <div style="margin-bottom:20px;">
            <h4 class="modal-section-heading">${cfIcon('document', 'icon--sm')} Content</h4>
            <div class="approval-content-preview">${this.escapeHtml(item.content.content || '')}</div>
          </div>
        ` : ''}

        ${item.reviewFeedback ? `
          <div style="margin-bottom:20px;">
            <h4 class="modal-section-heading">${cfIcon('check-circle', 'icon--sm')} Compliance review</h4>
            <div class="review-scores">
              <div class="review-score-item">
                <span class="review-score-value ${item.reviewFeedback.overallScore >= 75 ? 'high' : 'medium'}">${item.reviewFeedback.overallScore || '--'}</span>
                <span class="review-score-label">Overall</span>
              </div>
              <div class="review-score-item">
                <span class="review-score-value ${item.reviewFeedback.toneScore >= 75 ? 'high' : 'medium'}">${item.reviewFeedback.toneScore || '--'}</span>
                <span class="review-score-label">Tone</span>
              </div>
              <div class="review-score-item">
                <span class="review-score-value ${item.reviewFeedback.legalScore >= 75 ? 'high' : 'medium'}">${item.reviewFeedback.legalScore || '--'}</span>
                <span class="review-score-label">Legal</span>
              </div>
              <div class="review-score-item">
                <span class="review-score-value ${item.reviewFeedback.qualityScore >= 75 ? 'high' : 'medium'}">${item.reviewFeedback.qualityScore || '--'}</span>
                <span class="review-score-label">Quality</span>
              </div>
            </div>
          </div>
        ` : ''}

        ${item.localizedContent && Object.keys(item.localizedContent).length > 0 ? `
          <div style="margin-bottom:20px;">
            <h4 class="modal-section-heading">${cfIcon('globe', 'icon--sm')} Localizations</h4>
            ${Object.entries(item.localizedContent).map(([code, lc]) => `
              <div style="margin-bottom:8px;">
                <strong>${lc.localeName || code}</strong>
                <div class="approval-content-preview" style="max-height:150px;">${this.escapeHtml(lc.content || '')}</div>
              </div>
            `).join('')}
          </div>
        ` : ''}

        ${item.publishedContent && Object.keys(item.publishedContent).length > 0 ? `
          <div style="margin-bottom:20px;">
            <h4 class="modal-section-heading">${cfIcon('megaphone', 'icon--sm')} Published channels</h4>
            ${Object.entries(item.publishedContent).map(([ch, data]) => `
              <div style="margin-bottom:8px;">
                <strong class="modal-channel-title">${cfIcon(this.getChannelIconId(ch), 'icon--xs')} ${ch.charAt(0).toUpperCase() + ch.slice(1)}</strong>
                <div class="approval-content-preview" style="max-height:150px;">${this.renderChannelPreview(data, ch)}</div>
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>`;

    document.getElementById('modalOverlay').classList.add('active');
  }

  closeModal() {
    document.getElementById('modalOverlay').classList.remove('active');
  }

  // ===== Analytics Input =====
  onAnalyticsContentChange() {
    const select = document.getElementById('analyticsContentSelect');
    const platformArea = document.getElementById('analyticsPlatformArea');
    const inputArea = document.getElementById('analyticsInputArea');
    if (!select || !platformArea) return;

    const selectedOpt = select.selectedOptions[0];
    if (!select.value || !selectedOpt) {
      platformArea.style.display = 'none';
      if (inputArea) inputArea.style.display = 'none';
      return;
    }

    // Get channels from the selected content's data attribute
    let channels = ['blog', 'twitter', 'linkedin', 'email'];
    try {
      const ch = JSON.parse(selectedOpt.dataset.channels || '[]');
      if (ch.length > 0) channels = ch;
    } catch(e) {}

    const channelMeta = {
      blog: { label: 'Blog', color: '#6366f1', icon: 'document' },
      twitter: { label: 'X / Twitter', color: '#1DA1F2', icon: 'share' },
      linkedin: { label: 'LinkedIn', color: '#0A66C2', icon: 'linkedin' },
      email: { label: 'Email', color: '#f59e0b', icon: 'inbox' },
      youtube: { label: 'YouTube', color: '#FF0000', icon: 'activity' }
    };

    let btns = '<label style="font-size:0.82rem; font-weight:600; color:var(--accent-indigo); margin-bottom:8px; display:block;">Select Platform</label><div style="display:flex; gap:8px; flex-wrap:wrap;">';
    channels.forEach(ch => {
      const meta = channelMeta[ch] || { label: ch, color: '#6366f1', icon: 'document' };
      btns += `<button class="btn btn-outline analytics-platform-btn" data-channel="${ch}" onclick="app.selectAnalyticsPlatform('${ch}')" style="border-color:${meta.color}; color:${meta.color};">${meta.label}</button>`;
    });
    btns += '</div>';
    platformArea.innerHTML = btns;
    platformArea.style.display = 'block';
    if (inputArea) inputArea.style.display = 'none';
  }

  selectAnalyticsPlatform(channel) {
    // Highlight selected platform button
    const channelLabels = { blog: 'Blog', twitter: 'X / Twitter', linkedin: 'LinkedIn', email: 'Email', youtube: 'YouTube' };
    document.querySelectorAll('.analytics-platform-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.channel === channel);
      if (btn.dataset.channel === channel) {
        btn.style.background = btn.style.color;
        btn.style.color = '#fff';
      } else {
        btn.style.background = '';
        btn.style.color = btn.style.borderColor;
      }
    });

    // Set channel in the hidden select
    const chSelect = document.getElementById('analyticsChannel');
    if (chSelect) chSelect.value = channel;

    // Show the platform label
    const label = document.getElementById('analyticsSelectedPlatformLabel');
    if (label) {
      label.innerHTML = `${cfIcon(this.getChannelIconId(channel), 'icon--xs')} Entering data for <strong>${channelLabels[channel] || channel}</strong>`;
    }

    // Show input area
    const inputArea = document.getElementById('analyticsInputArea');
    if (inputArea) inputArea.style.display = 'block';

    // Reset input fields
    ['analyticsViews', 'analyticsClicks', 'analyticsShares', 'analyticsConversions'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '0';
    });
    const linkEl = document.getElementById('analyticsLink');
    if (linkEl) linkEl.value = '';
  }

  submitManualAnalytics() {
    const channel = document.getElementById('analyticsChannel').value;
    const views = parseInt(document.getElementById('analyticsViews').value, 10) || 0;
    const clicks = parseInt(document.getElementById('analyticsClicks').value, 10) || 0;
    const shares = parseInt(document.getElementById('analyticsShares').value, 10) || 0;
    const conversions = parseInt(document.getElementById('analyticsConversions').value, 10) || 0;
    const contentId = document.getElementById('analyticsContentSelect').value;

    if (views === 0 && clicks === 0 && shares === 0 && conversions === 0) {
      this.showToast('Please enter at least one metric value', 'warning');
      return;
    }

    // Get content title for display in the table
    const select = document.getElementById('analyticsContentSelect');
    const selectedOpt = select?.selectedOptions?.[0];
    const contentTitle = selectedOpt ? selectedOpt.textContent.replace(/\s*\(.*\)$/, '') : '';

    this.postAnalyticsData({ channel, views, clicks, shares, conversions, contentId, contentTitle });
    
    // Reset inputs
    ['analyticsViews', 'analyticsClicks', 'analyticsShares', 'analyticsConversions'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '0';
    });
  }

  async submitAnalyticsLink() {
    const link = document.getElementById('analyticsLink').value.trim();
    if (!link) {
      this.showToast('Please enter a URL to fetch', 'error');
      return;
    }

    const contentId = document.getElementById('analyticsContentSelect').value;
    const select = document.getElementById('analyticsContentSelect');
    const selectedOpt = select?.selectedOptions?.[0];
    const contentTitle = selectedOpt ? selectedOpt.textContent.replace(/\s*\(.*\)$/, '') : '';

    // Determine channel from link
    let channel = document.getElementById('analyticsChannel').value || 'blog';
    if (link.includes('twitter.com') || link.includes('x.com')) channel = 'twitter';
    else if (link.includes('linkedin.com')) channel = 'linkedin';
    else if (link.includes('youtube.com') || link.includes('youtu.be')) channel = 'youtube';

    this.showToast('Scraping metrics from URL...', 'info');

    try {
      const resp = await fetch(`${API_BASE}/api/analytics/scrape`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: link })
      });
      const data = await resp.json();
      
      if (!data.success) {
        this.showToast(`Scrape failed: ${data.error}`, 'error');
        return;
      }
      
      const { views, clicks, shares, conversions } = data.data;
      this.postAnalyticsData({ channel, views, clicks, shares, conversions, contentId, contentTitle });
      document.getElementById('analyticsLink').value = '';

    } catch(err) {
      this.showToast(`Scraper error: ${err.message}`, 'error');
    }
  }

  async postAnalyticsData(data) {
    this.showToast('Adding analytics data...', 'info');
    try {
      const res = await fetch(`${API_BASE}/api/analytics/input`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const result = await res.json();
      if (result.success) {
        this.showToast('Analytics data added successfully!', 'success');
        this.loadAnalytics();
        this.loadDashboard();
      } else {
        this.showToast(`Error: ${result.error}`, 'error');
      }
    } catch (err) {
      this.showToast(`Network error: ${err.message}`, 'error');
    }
  }

  // ===== Analytics =====
  async loadAnalytics() {
    try {
      const [resData, resItems] = await Promise.all([
        fetch(`${API_BASE}/api/analytics`).then(r => r.json()),
        fetch(`${API_BASE}/api/content`).then(r => r.json())
      ]);

      let contents = [];
      if (resItems && resItems.success) {
        contents = resItems.data;
        const select = document.getElementById('analyticsContentSelect');
        if (select) {
          const currentVal = select.value;
          select.innerHTML = '<option value="">General (No specific content)</option>';
          contents.forEach(item => {
            const opt = document.createElement('option');
            opt.value = item.id;
            const title = item.content?.title || item.brief?.topic || item.title || 'Untitled';
            opt.textContent = `${title} (${this.formatStageName(item.status)})`;
            // Store channels data on the option
            opt.dataset.channels = JSON.stringify(item.brief?.channels || ['blog']);
            select.appendChild(opt);
          });
          if (currentVal) select.value = currentVal;
          else {
            const recentlyPublished = contents.find(c => c.status === 'completed' || c.status === 'published');
            if (recentlyPublished) select.value = recentlyPublished.id;
            else if (contents.length > 0) select.value = contents[0].id;
          }
          // Trigger platform update for current selection
          this.onAnalyticsContentChange();
        }
      }

      if (!resData.success) return;
      const analytics = resData.data;
      const container = document.getElementById('engagementAnalytics');
      const tableBody = document.getElementById('analyticsContentTableBody');
      
      // Render Content Performance Table
      if (tableBody && analytics.engagementData) {
        if (analytics.engagementData.length === 0) {
          tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:15px; color:var(--text-muted);">No content-specific data yet.</td></tr>`;
        } else {
          const contentEngagement = analytics.engagementData.filter(d => d.contentId);
          const grouped = {};
          contentEngagement.forEach(d => {
            const key = d.contentId + '_' + d.channel;
            if (!grouped[key]) {
              grouped[key] = { title: d.contentTitle || 'Unknown Content', channel: d.channel, views: 0, clicks: 0, shares: 0 };
            }
            grouped[key].views += d.views || 0;
            grouped[key].clicks += d.clicks || 0;
            grouped[key].shares += d.shares || 0;
          });
          
          const rows = Object.values(grouped).map(g => `
            <tr style="border-bottom: 1px solid var(--border-color);">
              <td style="padding:10px; font-weight:500;">${this.escapeHtml(g.title)}</td>
              <td style="padding:10px;"><span class="table-channel-cell">${cfIcon(this.getChannelIconId(g.channel), 'icon--xs')} <span style="text-transform:capitalize;">${g.channel}</span></span></td>
              <td style="padding:10px;">${g.views.toLocaleString()}</td>
              <td style="padding:10px;">${g.clicks.toLocaleString()}</td>
              <td style="padding:10px;">${g.shares.toLocaleString()}</td>
            </tr>
          `).join('');
          
          tableBody.innerHTML = rows || `<tr><td colspan="5" style="text-align:center; padding:15px; color:var(--text-muted);">No content-specific data yet.</td></tr>`;
        }
      }

      // Aggregate engagement data
      const channelSummary = {};
      (analytics.engagementData || []).forEach(d => {
        if (!channelSummary[d.channel]) {
          channelSummary[d.channel] = { views: 0, clicks: 0, shares: 0, conversions: 0, count: 0 };
        }
        channelSummary[d.channel].views += d.views;
        channelSummary[d.channel].clicks += d.clicks;
        channelSummary[d.channel].shares += d.shares;
        channelSummary[d.channel].conversions += d.conversions;
        channelSummary[d.channel].count++;
      });

      container.innerHTML = `
        <div class="metrics-grid" style="margin-bottom:20px;">
          <div class="metric-card gradient-purple">
            <div class="metric-icon">${cfIcon('chart', 'icon--lg')}</div>
            <div class="metric-info">
              <span class="metric-value">${analytics.totalContentCreated}</span>
              <span class="metric-label">Total Content</span>
            </div>
          </div>
          <div class="metric-card gradient-green">
            <div class="metric-icon">${cfIcon('check-circle', 'icon--lg')}</div>
            <div class="metric-info">
              <span class="metric-value">${analytics.approvalRate}%</span>
              <span class="metric-label">Approval Rate</span>
            </div>
          </div>
          <div class="metric-card gradient-amber">
            <div class="metric-icon">${cfIcon('clock', 'icon--lg')}</div>
            <div class="metric-info">
              <span class="metric-value">${analytics.averageCycleTimeFormatted || '--'}</span>
              <span class="metric-label">Avg Cycle Time</span>
            </div>
          </div>
          <div class="metric-card gradient-blue">
            <div class="metric-icon">${cfIcon('shield', 'icon--lg')}</div>
            <div class="metric-info">
              <span class="metric-value">${analytics.averageComplianceScore || '--'}%</span>
              <span class="metric-label">Avg Compliance</span>
            </div>
          </div>
        </div>

        <h4 style="margin-bottom:12px;">Channel Engagement (Last 14 Days)</h4>
        <table class="engagement-table">
          <thead>
            <tr>
              <th>Channel</th>
              <th>Total Views</th>
              <th>Clicks</th>
              <th>Shares</th>
              <th>Conversions</th>
              <th>CTR</th>
            </tr>
          </thead>
          <tbody>
            ${Object.entries(channelSummary).map(([ch, d]) => `
              <tr>
                <td><span class="table-channel-cell">${cfIcon(this.getChannelIconId(ch), 'icon--xs')} ${ch.charAt(0).toUpperCase() + ch.slice(1)}</span></td>
                <td>${d.views.toLocaleString()}</td>
                <td>${d.clicks.toLocaleString()}</td>
                <td>${d.shares.toLocaleString()}</td>
                <td>${d.conversions.toLocaleString()}</td>
                <td>${((d.clicks / d.views) * 100).toFixed(1)}%</td>
              </tr>
            `).join('')}
          </tbody>
        </table>`;
    } catch (err) {
      console.error('Analytics load error:', err);
    }
  }

  // ===== Content Intelligence =====
  async simulateVideoPivot() {
    this.showToast('Injecting video outperformance data...', 'info');
    try {
      const res = await fetch(`${API_BASE}/api/intelligence/inject-video-data`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        this.showToast('Data injected. Running AI Analysis...', 'success');
        this.runIntelligenceAnalysis();
      } else {
        this.showToast(`Error: ${data.error}`, 'error');
      }
    } catch (e) {
      this.showToast(`Network error: ${e.message}`, 'error');
    }
  }

  async runIntelligenceAnalysis() {
    const btn = document.getElementById('runIntelligenceBtn');
    btn.disabled = true;
    btn.textContent = 'Analyzing...';

    this._intelligenceBusy = true;
    this.syncAgentActivityUI();

    const container = document.getElementById('intelligenceResults');
    container.innerHTML = '<div style="text-align:center; padding:40px;"><div class="spinner" style="margin:0 auto 12px;"></div><p class="text-muted">Intelligence Agent is analyzing engagement data...</p></div>';

    try {
      const res = await fetch(`${API_BASE}/api/intelligence/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await res.json();

      if (data.success && data.data) {
        const intel = data.data;
        container.innerHTML = `
          <div class="intelligence-section">
            <h4 class="intelligence-heading">${cfIcon('chart', 'icon--sm')} Overall analysis</h4>
            <div style="padding:14px; background:var(--bg-glass); border-radius:var(--border-radius-sm); margin-bottom:16px;">
              <p style="font-size:0.9rem; color:var(--text-primary); margin-bottom:8px;">
                <strong>Trend:</strong> <span style="color:${intel.analysis?.overallTrend === 'improving' ? 'var(--accent-emerald)' : intel.analysis?.overallTrend === 'declining' ? 'var(--accent-rose)' : 'var(--accent-amber)'}">${intel.analysis?.overallTrend || 'N/A'}</span>
              </p>
              <p style="font-size:0.85rem; color:var(--text-secondary);">${intel.analysis?.trendDescription || ''}</p>
              <div style="display:flex; gap:20px; margin-top:10px;">
                <span style="font-size:0.82rem;">Top channel: <strong style="color:var(--accent-emerald);">${intel.analysis?.topChannel || 'N/A'}</strong></span>
                <span style="font-size:0.82rem;">Needs work: <strong style="color:var(--accent-amber);">${intel.analysis?.weakestChannel || 'N/A'}</strong></span>
              </div>
            </div>
          </div>

          ${intel.recommendations && intel.recommendations.length > 0 ? `
            <div class="intelligence-section">
              <h4 class="intelligence-heading">${cfIcon('bulb', 'icon--sm')} Recommendations</h4>
              ${intel.recommendations.map(r => `
                <div class="recommendation-card">
                  <span class="recommendation-priority ${r.priority}">${r.priority}</span>
                  <p style="font-size:0.9rem; color:var(--text-primary); margin:6px 0;">${this.escapeHtml(r.recommendation)}</p>
                  <p style="font-size:0.8rem; color:var(--text-muted);">Expected: ${this.escapeHtml(r.expectedImpact || '')} · ${this.escapeHtml(r.timeframe || '')}</p>
                </div>
              `).join('')}
            </div>
          ` : ''}

          ${intel.contentSuggestions && intel.contentSuggestions.length > 0 ? `
            <div class="intelligence-section">
              <h4 class="intelligence-heading">${cfIcon('sparkles', 'icon--sm')} Content suggestions</h4>
              ${intel.contentSuggestions.map(s => `
                <div class="recommendation-card">
                  <p style="font-size:0.9rem; color:var(--text-primary); margin-bottom:4px;"><strong>${this.escapeHtml(s.topic)}</strong></p>
                  <p style="font-size:0.8rem; color:var(--text-muted);">${s.format} · ${s.targetChannel} · ${this.escapeHtml(s.rationale || '')}</p>
                </div>
              `).join('')}
            </div>
          ` : ''}

          ${intel.contentCalendar && intel.contentCalendar.length > 0 ? `
            <div class="intelligence-section" style="margin-top: 24px; border: 1px solid var(--accent-indigo); border-radius: 8px; overflow: hidden; background: var(--bg-card);">
              <div style="background: rgba(99, 102, 241, 0.1); padding: 16px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(99, 102, 241, 0.3);">
                <div>
                  <h4 class="intelligence-heading" style="margin:0; color:var(--accent-indigo); display: flex; align-items: center; gap: 8px;">${cfIcon('clock', 'icon--sm')} Recommended Content Calendar</h4>
                  <p style="font-size:0.8rem; color:var(--text-secondary); margin-top:4px;">Approve this schedule to automatically draft these items.</p>
                </div>
                <button class="btn btn-primary btn-sm" style="display: flex; align-items: center; gap: 6px;" onclick='app.approveCalendarAndDraft(${JSON.stringify(intel.contentCalendar).replace(/'/g, "&#39;")})'>
                  ${cfIcon('rocket', 'icon--xs')} Approve & Draft All
                </button>
              </div>
              <div style="padding: 16px;">
                ${intel.contentCalendar.map(c => `
                  <div class="recommendation-card" style="display: flex; gap: 16px; flex-direction: row; border-top: none; border-left: 3px solid var(--accent-indigo);">
                    <div style="min-width: 100px; font-weight: 600; color: var(--text-primary);">${this.escapeHtml(c.date)}</div>
                    <div>
                      <p style="font-size:0.95rem; color:var(--text-primary); margin-bottom:4px; font-weight: 600;">${this.escapeHtml(c.topic)}</p>
                      <p style="font-size:0.8rem; color:var(--text-muted); display:flex; gap:6px; align-items:center;">${this.escapeHtml(c.format)} <span class="badge" style="background:var(--accent-indigo); color:white; padding:2px 6px; border-radius:4px; font-size:0.7rem; font-weight: 600;">${this.escapeHtml(c.status).toUpperCase()}</span></p>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}

          <div class="intelligence-section">
            <p style="font-size:0.85rem; color:var(--text-secondary); font-style:italic;">${this.escapeHtml(intel.summary || '')}</p>
          </div>`;
      } else {
        container.innerHTML = `<div class="empty-state"><span class="empty-icon-wrap" aria-hidden="true">${cfIcon('alert', 'icon--empty')}</span><p>Could not generate insights. Please try again.</p></div>`;
      }
    } catch (err) {
      container.innerHTML = `<div class="empty-state"><span class="empty-icon-wrap" aria-hidden="true">${cfIcon('x', 'icon--empty')}</span><p>Error: ${this.escapeHtml(err.message)}</p></div>`;
    } finally {
      this._intelligenceBusy = false;
      this.syncAgentActivityUI();
      btn.disabled = false;
      btn.textContent = 'Run Analysis';
    }
  }

  async approveCalendarAndDraft(calendarItems) {
    if (!calendarItems || calendarItems.length === 0) return;
    
    this.showToast(`Starting ${calendarItems.length} pipeline jobs for scheduled content...`, 'info');
    
    try {
      // Loop through and start pipelines
      for (const item of calendarItems) {
        const brief = {
          topic: item.topic,
          format: item.format || 'blog_post',
          audience: 'general business professionals',
          tone: 'professional yet approachable',
          wordCount: '500-800 words',
          channels: ['blog', 'twitter', 'linkedin', 'email', 'youtube'],
          locales: [
            { code: 'hi-IN', name: 'Hindi (India)', region: 'India' },
            { code: 'ta-IN', name: 'Tamil (India)', region: 'India' }
          ]
        };
        
        await fetch(`${API_BASE}/api/pipeline/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(brief)
        });
      }
      
      this.showToast('Successfully scheduled and started all drafts!', 'success');
      this.navigateTo('pipeline');
      this._startRapidPoll();
    } catch (e) {
      this.showToast(`Error starting async pipelines: ${e.message}`, 'error');
    }
  }

  // ===== Brand Monitor =====
  async loadBrandMonitor() {
    try {
      const res = await fetch(`${API_BASE}/api/brand-guidelines`);
      const data = await res.json();

      if (!data.success) return;

      const guidelines = data.data;
      const container = document.getElementById('brandRulesContainer');

      container.innerHTML = `
        <div class="brand-section">
          <h4 class="brand-section-title">Brand voice</h4>
          <div style="padding:14px; background:var(--bg-glass); border-radius:var(--border-radius-sm); margin-bottom:16px;">
            <p style="font-size:0.9rem; margin-bottom:8px;"><strong>Voice:</strong> ${guidelines.tone?.voice || 'N/A'}</p>
            <p style="font-size:0.9rem; margin-bottom:8px;"><strong>Personality:</strong> ${(guidelines.tone?.personality || []).join(', ')}</p>
            <p style="font-size:0.9rem;"><strong>Formality:</strong> ${guidelines.tone?.formality || 'N/A'}</p>
          </div>
          <ul style="list-style:none; display:flex; flex-direction:column; gap:6px;">
            ${(guidelines.tone?.guidelines || []).map(g => `
              <li style="font-size:0.85rem; color:var(--text-secondary); padding:6px 12px; background:var(--bg-glass); border-radius:6px;">✓ ${this.escapeHtml(g)}</li>
            `).join('')}
          </ul>
        </div>

        <div class="brand-section">
          <h4 class="brand-section-title">Banned terminology</h4>
          <div class="term-grid">
            ${(guidelines.terminology?.banned || []).map(t => `
              <div class="term-card">
                <div class="term-banned">✕ "${t.term}"</div>
                <div class="term-replacement">→ Use: "${t.replacement}"</div>
                <div class="term-reason">${t.reason}</div>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="brand-section">
          <h4 class="brand-section-title">Preferred terminology</h4>
          <div class="term-grid">
            ${Object.entries(guidelines.terminology?.preferred || {}).map(([term, note]) => `
              <div class="term-card">
                <div style="color:var(--accent-emerald); font-weight:600;">✓ "${term}"</div>
                <div class="term-reason">${note}</div>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="brand-section">
          <h4 class="brand-section-title">Legal & regulatory</h4>
          <div class="term-grid">
            ${(guidelines.legal?.regulatedTerms || []).map(t => `
              <div class="term-card">
                <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
                  <span class="issue-severity ${t.severity}">${t.severity}</span>
                  <strong>"${t.term}"</strong>
                </div>
                <div class="term-reason">${t.context}</div>
              </div>
            `).join('')}
          </div>
        </div>`;
    } catch (err) {
      console.error('Brand load error:', err);
    }
  }

  // ===== Branding Submit =====
  async submitBrandGuideline() {
    const guideline = document.getElementById('newBrandGuideline').value;
    if (!guideline) {
      this.showToast('Please enter a guideline', 'error');
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/brand-guidelines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toneGuideline: guideline })
      });
      const data = await res.json();
      if (data.success) {
        this.showToast('Brand guideline added successfully!', 'success');
        document.getElementById('newBrandGuideline').value = '';
        this.loadBrandMonitor();
      } else {
        this.showToast(`Error: ${data.error}`, 'error');
      }
    } catch (err) {
      this.showToast(`Network error: ${err.message}`, 'error');
    }
  }

  // ===== Polling =====
  startPolling() {
    setInterval(() => {
      if (this.currentSection === 'dashboard') this.loadDashboard();
      if (this.currentSection === 'pipeline') this.loadPipeline();
      if (this.currentSection === 'library') this.loadLibrary();
    }, 4000);
  }

  _startRapidPoll() {
    let count = 0;
    const maxPolls = 15; // 15 × 2s = 30 seconds of rapid polling
    const id = setInterval(() => {
      count++;
      if (count >= maxPolls || !this._hasInProgressItems()) {
        clearInterval(id);
        return;
      }
      if (this.currentSection === 'pipeline') this.loadPipeline();
      else if (this.currentSection === 'dashboard') this.loadDashboard();
    }, 2000);
  }

  _hasInProgressItems() {
    return this.contentItems.some(item =>
      item.status && item.status.includes('in_progress')
    );
  }

  renderFailedStage(item) {
    const status = item.status || '';
    if (!status.includes('failed')) return '';

    const stageMap = {
      'draft_failed': 'drafting',
      'review_failed': 'review',
      'localization_failed': 'localization',
      'publishing_failed': 'publishing'
    };
    const failedStage = stageMap[status] || item.currentStage;
    const errorMsg = item.stages?.[failedStage]?.result?.error || 'An unknown error occurred while processing.';

    return `
      <div class="approval-gate" style="border: 1px solid var(--accent-rose); background: rgba(244,63,94,0.06);">
        <div class="approval-header">
          <span class="approval-title" style="color: var(--accent-rose);">
            <span class="approval-title-icon" aria-hidden="true">${cfIcon('alert', 'icon--sm')}</span>
            ${this.formatStageName(failedStage)} Failed
          </span>
          <span class="approval-badge" style="background: rgba(244,63,94,0.15); color: var(--accent-rose);">Error</span>
        </div>
        <div style="padding: 12px 0; color: var(--text-secondary); font-size: 0.88rem;">
          <p style="margin-bottom: 12px;"><strong>Error:</strong> ${this.escapeHtml(errorMsg)}</p>
          <p style="color: var(--text-muted); font-size: 0.82rem;">This may be due to an API key issue, rate limiting, or network error. You can retry the pipeline.</p>
        </div>
        <div class="approval-actions">
          <button type="button" class="btn btn-primary btn-sm btn-with-icon" onclick="app.retryFailedPipeline('${item.id}', '${failedStage}')">
            ${cfIcon('refresh', 'icon--btn')} Retry ${this.formatStageName(failedStage)}
          </button>
        </div>
      </div>`;
  }

  async retryFailedPipeline(contentId, stage) {
    this.showToast(`Retrying ${this.formatStageName(stage)}...`, 'info');
    try {
      const res = await fetch(`${API_BASE}/api/pipeline/${contentId}/retry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage })
      });
      const data = await res.json();
      if (data.success) {
        this.showToast(`${this.formatStageName(stage)} restarted!`, 'success');
        this._startRapidPoll();
        await this.loadPipeline();
      } else {
        this.showToast(`Error: ${data.error}`, 'error');
      }
    } catch (err) {
      this.showToast(`Network error: ${err.message}`, 'error');
    }
  }

  // ===== Agent activity (roster + top strip) =====
  truncateText(str, max) {
    const s = String(str || '');
    if (s.length <= max) return s;
    return `${s.slice(0, Math.max(0, max - 1))}…`;
  }

  getWorkingStageForItem(item) {
    if (!item || item.currentStage === 'completed') return null;
    const stage = item.currentStage;
    if (!stage) return null;
    const sd = item.stages?.[stage];
    if (sd?.status === 'in_progress') return stage;
    const st = item.status || '';
    if (st.includes('_in_progress')) return stage;
    return null;
  }

  syncAgentActivityUI() {
    const items = Array.isArray(this.contentItems) ? this.contentItems : [];
    const working = [];
    for (const item of items) {
      const stage = this.getWorkingStageForItem(item);
      if (stage) {
        working.push({
          stage,
          topic: item.brief?.topic || item.content?.title || 'Content',
          updatedAt: item.updatedAt || 0
        });
      }
    }
    if (this._intelligenceBusy) {
      working.push({ stage: 'intelligence', topic: 'Engagement & strategy', updatedAt: Date.now() + 1 });
    }

    // Determine completed stages from only the most recent active pipeline item
    const completedStages = new Set();
    // Find the most recent non-completed item (sorted newest first)
    const sortedItems = [...items].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    const activeItem = sortedItems.find(i => i.status !== 'completed' && i.status !== 'rejected');
    if (activeItem && activeItem.stages) {
      for (const [stageName, stageData] of Object.entries(activeItem.stages)) {
        if (stageData.status === 'approved' || stageData.status === 'completed') {
          completedStages.add(stageName);
        }
      }
    }
    // If no active item, don't show any completed — agents reset to idle

    document.querySelectorAll('.agent-roster-item[data-pipeline-stage]').forEach(el => {
      const st = el.dataset.pipelineStage;
      const busy = working.some(w => w.stage === st);
      const done = completedStages.has(st);
      el.classList.toggle('agent-roster-item--working', busy);
      el.classList.toggle('agent-roster-item--completed', !busy && done);
    });

    const strip = document.getElementById('agentWorkStrip');
    const textEl = document.getElementById('agentWorkStripText');
    const hint = document.getElementById('agentFooterHint');
    if (!strip || !textEl) return;

    if (working.length === 0) {
      strip.hidden = true;
      textEl.textContent = '';
      if (hint) hint.textContent = 'Idle — start a pipeline to see live activity';
      return;
    }

    working.sort((a, b) => b.updatedAt - a.updatedAt);
    const primary = working[0];
    const meta = PIPELINE_AGENT_META[primary.stage];
    const topic = this.truncateText(primary.topic, 56);
    strip.hidden = false;
    if (meta) {
      textEl.innerHTML = `<strong>${this.escapeHtml(meta.name)}</strong> — ${this.escapeHtml(meta.verb)} · <span style="color:var(--text-muted)">“${this.escapeHtml(topic)}”</span>`;
    } else {
      textEl.textContent = 'Processing your content…';
    }

    if (hint) {
      hint.textContent =
        working.length === 1 ? 'An agent is working on your content' : `${working.length} agent tasks in progress`;
    }
  }

  // ===== Utilities =====
  getStageIcon(stage) {
    const map = {
      drafting: 'pencil',
      review: 'check-circle',
      localization: 'globe',
      publishing: 'megaphone',
      completed: 'check-circle'
    };
    const id = map[stage] || 'document';
    return typeof cfIcon === 'function' ? cfIcon(id, 'icon--activity') : '';
  }

  getChannelIconId(channel) {
    const c = String(channel || '').toLowerCase();
    const map = { blog: 'document', twitter: 'twitter', linkedin: 'briefcase', email: 'mail', youtube: 'video' };
    return map[c] || 'document';
  }

  formatStageName(stage) {
    const names = { drafting: 'Drafting', review: 'Compliance Review', localization: 'Localization', publishing: 'Publishing' };
    return names[stage] || stage;
  }

  formatStageStatus(status) {
    const labels = {
      pending: 'Pending', in_progress: 'Processing', awaiting_approval: 'Awaiting',
      approved: 'Approved', rejected: 'Rejected', revision_requested: 'Revising', completed: 'Done'
    };
    return labels[status] || status;
  }

  formatStatus(status) {
    if (!status) return 'Unknown';
    return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  getStatusClass(status) {
    if (!status) return 'status-draft';
    if (status.includes('completed') || status === 'completed') return 'status-completed';
    if (status.includes('in_progress') || status.includes('revision')) return 'status-in-progress';
    if (status.includes('awaiting')) return 'status-awaiting';
    if (status.includes('rejected') || status.includes('failed')) return 'status-rejected';
    return 'status-draft';
  }

  timeAgo(timestamp) {
    const diff = Date.now() - timestamp;
    const secs = Math.floor(diff / 1000);
    const mins = Math.floor(secs / 60);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (mins > 0) return `${mins}m ago`;
    return 'Just now';
  }

  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const iconIds = { success: 'check-circle', error: 'x', warning: 'alert', info: 'info' };
    const iid = iconIds[type] || 'info';
    const iconHtml = typeof cfIcon === 'function' ? cfIcon(iid, 'toast-svg') : '';
    toast.innerHTML = `<span class="toast-icon" aria-hidden="true">${iconHtml}</span><span class="toast-text">${this.escapeHtml(message)}</span>`;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('toast-visible'));
    setTimeout(() => {
      toast.classList.add('toast-hiding');
      setTimeout(() => toast.remove(), 380);
    }, 5200);
  }
}

// Initialize
const app = new ContentForgeApp();

// Close modal on overlay click
document.getElementById('modalOverlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) app.closeModal();
});

// Close modal on escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') app.closeModal();
});
