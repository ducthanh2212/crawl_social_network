document.addEventListener('DOMContentLoaded', () => {
  const auditForm = document.getElementById('auditForm');
  const autoKeywordsToggle = document.getElementById('autoKeywordsToggle');
  const customKeywordsGroup = document.getElementById('customKeywordsGroup');
  const startAuditBtn = document.getElementById('startAuditBtn');
  const logContainer = document.getElementById('logContainer');
  const clearLogsBtn = document.getElementById('clearLogsBtn');
  const pipelinePhaseBadge = document.getElementById('pipelinePhaseBadge');
  const systemStatusBadge = document.getElementById('systemStatusBadge');
  const reportCard = document.getElementById('reportCard');
  const closeReportBtn = document.getElementById('closeReportBtn');
  const historyList = document.getElementById('historyList');
  const refreshHistoryBtn = document.getElementById('refreshHistoryBtn');

  let activeJobId = null;
  let statusPollInterval = null;

  // Toggle custom keywords input based on AI Auto switch
  autoKeywordsToggle.addEventListener('change', () => {
    if (autoKeywordsToggle.checked) {
      customKeywordsGroup.style.display = 'none';
    } else {
      customKeywordsGroup.style.display = 'flex';
    }
  });

  // Clear terminal logs
  clearLogsBtn.addEventListener('click', () => {
    logContainer.innerHTML = '';
  });

  // Close report card
  closeReportBtn.addEventListener('click', () => {
    reportCard.style.display = 'none';
  });

  // Refresh history list
  refreshHistoryBtn.addEventListener('click', loadHistory);
  loadHistory();

  // Handle Form Submission
  auditForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const target = document.getElementById('kolTarget').value.trim();
    const domain = document.getElementById('kolDomain').value.trim();
    const autoKeywords = autoKeywordsToggle.checked;
    const customKeywordsStr = document.getElementById('customKeywords').value.trim();
    const maxPosts = parseInt(document.getElementById('maxPosts').value, 10) || 8;
    const maxComments = parseInt(document.getElementById('maxComments').value, 10) || 12;
    const headless = document.getElementById('headlessToggle').checked;

    let keywords = ['phốt', 'review', 'lừa đảo', 'drama'];
    if (!autoKeywords && customKeywordsStr) {
      keywords = customKeywordsStr.split(',').map(k => k.trim()).filter(Boolean);
    }

    // Disable button while starting
    startAuditBtn.disabled = true;
    startAuditBtn.innerHTML = `<span class="btn-icon">⏳</span><span class="btn-text">ĐANG KHỞI TẠO CHIẾN DỊCH...</span>`;
    reportCard.style.display = 'none';

    addLog('system', `Bắt đầu gửi yêu cầu thẩm định cho KOL: "${target}" (${domain})...`);
    pipelinePhaseBadge.style.display = 'inline-block';
    pipelinePhaseBadge.textContent = 'Khởi tạo...';
    systemStatusBadge.innerHTML = `<span class="dot dot-yellow"></span> Running Audit...`;

    try {
      const res = await fetch('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target,
          domain,
          autoKeywords,
          keywords,
          maxPosts,
          maxComments,
          headless
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Không thể khởi chạy tiến trình cào dữ liệu');
      }

      activeJobId = data.jobId;
      addLog('info', `✅ Chiến dịch đã khởi chạy (Job ID: ${activeJobId}). Đang giám sát thời gian thực...`);

      // Start polling status every 1.5 seconds
      if (statusPollInterval) clearInterval(statusPollInterval);
      statusPollInterval = setInterval(pollJobStatus, 1500);

    } catch (err) {
      addLog('error', `❌ Lỗi khởi chạy: ${err.message}`);
      resetButtonState();
    }
  });

  async function pollJobStatus() {
    if (!activeJobId) return;

    try {
      const res = await fetch(`/api/status?jobId=${activeJobId}`);
      const data = await res.json();

      if (data.logs && data.logs.length > 0) {
        // Append unshown logs
        data.logs.forEach(log => {
          addLog(log.level || 'info', log.message, log.time);
        });
      }

      if (data.phase) {
        pipelinePhaseBadge.textContent = data.phase;
      }

      if (data.status === 'completed') {
        clearInterval(statusPollInterval);
        statusPollInterval = null;
        activeJobId = null;

        pipelinePhaseBadge.style.display = 'none';
        addLog('success', `🎉 HOÀN TẤT THẨM ĐỊNH! Đang hiển thị Báo cáo Brand Safety...`);
        resetButtonState();
        loadHistory();

        if (data.report) {
          renderReport(data.report);
        }
      } else if (data.status === 'error') {
        clearInterval(statusPollInterval);
        statusPollInterval = null;
        activeJobId = null;

        pipelinePhaseBadge.style.display = 'none';
        addLog('error', `❌ Tiến trình bị lỗi giữa chừng: ${data.errorMessage}`);
        resetButtonState();
      }
    } catch (err) {
      console.error('Polling error:', err);
    }
  }

  function addLog(type, msg, timeStr = null) {
    const time = timeStr || new Date().toLocaleTimeString('vi-VN');
    const entry = document.createElement('div');
    entry.className = `log-entry log-${type}`;
    entry.innerHTML = `<span class="log-time">[${time}]</span><span class="log-msg">${escapeHtml(msg)}</span>`;
    logContainer.appendChild(entry);
    logContainer.scrollTop = logContainer.scrollHeight;
  }

  function resetButtonState() {
    startAuditBtn.disabled = false;
    startAuditBtn.innerHTML = `<span class="btn-icon">⚡</span><span class="btn-text">BẮT ĐẦU QUÉT & THẨM ĐỊNH AI</span>`;
    systemStatusBadge.innerHTML = `<span class="dot dot-green"></span> System Ready`;
  }

  function renderReport(rep) {
    reportCard.style.display = 'flex';
    const kolName = rep.kolName || rep.targetKol || rep.target || '--';
    document.getElementById('reportKolTitle').textContent = `Hồ sơ KOL: ${kolName}`;
    document.getElementById('reportDate').textContent = `Ngày báo cáo: ${rep.auditDate || new Date().toLocaleString('vi-VN')}`;

    // Download buttons
    const baseCleanName = rep.filename ? rep.filename.replace('.json', '').replace('REPORT_', '') : sanitizeName(kolName);
    const mdName = `REPORT_${baseCleanName}.md`;
    const jsonName = `REPORT_${baseCleanName}.json`;
    const downloadMdBtn = document.getElementById('downloadMdBtn');
    const downloadJsonBtn = document.getElementById('downloadJsonBtn');
    if (downloadMdBtn) downloadMdBtn.href = `/api/report/download?file=${encodeURIComponent(mdName)}`;
    if (downloadJsonBtn) downloadJsonBtn.href = `/api/report/download?file=${encodeURIComponent(jsonName)}`;

    // Score Circle
    const exec = rep.executiveSummary || {};
    const score = exec.brandSafetyScore !== undefined ? exec.brandSafetyScore : (rep.brandSafetyScore !== undefined ? rep.brandSafetyScore : '--');
    const scoreValEl = document.getElementById('scoreValue');
    const scoreCircleEl = document.getElementById('scoreCircle');
    scoreValEl.textContent = score;

    let borderCol = '#00e676';
    if (score !== '--' && score < 50) borderCol = '#ff3b30';
    else if (score !== '--' && score < 75) borderCol = '#ffcf00';
    scoreCircleEl.style.borderColor = borderCol;

    // Recommendation Text
    const riskLevel = exec.riskLevel || rep.riskLevel || 'SAFE';
    let riskLevelDisplay = '🛡️ AN TOÀN THƯƠNG HIỆU (SAFE)';
    if (riskLevel === 'HIGH_RISK_AVOID') riskLevelDisplay = '🛑 RỦI RO CAO - CẦN TRÁNH (HIGH RISK)';
    else if (riskLevel === 'MODERATE_RISK') riskLevelDisplay = '⚠️ RỦI RO TRUNG BÌNH (MODERATE RISK)';

    document.getElementById('riskLevelText').textContent = riskLevelDisplay;
    
    const rec = rep.recommendation || rep.recommendations || {};
    document.getElementById('cooperationAdviceText').textContent = rec.cooperationAdvice || 'Đã tổng hợp hồ sơ thẩm định chi tiết.';

    // Stats
    const stats = exec.classificationCounts || rep.classificationSummary || {};
    document.getElementById('countPositive').textContent = stats.POSITIVE || stats.positive || 0;
    document.getElementById('countNeutral').textContent = stats.NEUTRAL || stats.neutral || 0;
    document.getElementById('countMild').textContent = stats.NEGATIVE_MILD || stats.mild_criticism || 0;
    document.getElementById('countScandal').textContent = stats.SCANDAL_HIGH_RISK || stats.scandal_high_risk || 0;

    // Scandals Table
    const tbody = document.getElementById('scandalTableBody');
    tbody.innerHTML = '';
    const scandals = rep.scandalChronicle || [];

    if (scandals.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #00e676; padding: 20px;">✅ Không phát hiện lùm xùm/phốt nghiêm trọng nào!</td></tr>`;
    } else {
      scandals.forEach((sc, idx) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${idx + 1}</td>
          <td style="font-weight: 600; color: #ff3b30;">${escapeHtml(sc.title || sc.event_name || 'Lùm xùm')}</td>
          <td>${escapeHtml(sc.summary || sc.event_summary || '--')}</td>
          <td><span class="badge" style="background: rgba(255, 59, 48, 0.2); color: #ff3b30;">${escapeHtml(sc.severity || (sc.severity_score_0_to_100 + ' pt') || 'Nghiêm trọng')}</span></td>
          <td>${escapeHtml(sc.veracity || sc.is_verified_by_evidence_or_rumor || '--')}</td>
          <td><a href="${escapeHtml(sc.sourceUrl || sc.source_url || '#')}" target="_blank" style="color: #4facfe;">Xem bài gốc ↗</a></td>
        `;
        tbody.appendChild(tr);
      });
    }

    // Recommendations Lists
    const safeList = document.getElementById('safeDomainsList');
    safeList.innerHTML = '';
    const safeDomains = rec.safeCategories || rec.safeToCooperateDomains || [];
    if (safeDomains.length === 0) safeList.innerHTML = '<li>Tất cả các nhãn hàng sạch, không vi phạm pháp luật</li>';
    else safeDomains.forEach(d => safeList.innerHTML += `<li>${escapeHtml(d)}</li>`);

    const prohList = document.getElementById('prohibitedDomainsList');
    prohList.innerHTML = '';
    const prohDomains = rec.prohibitedCategories || rec.prohibitedDomains || [];
    if (prohDomains.length === 0) prohList.innerHTML = '<li>Không có hạn chế đặc biệt</li>';
    else prohDomains.forEach(d => prohList.innerHTML += `<li>${escapeHtml(d)}</li>`);

    // Scroll to report
    reportCard.scrollIntoView({ behavior: 'smooth' });
  }

  async function loadHistory() {
    try {
      const res = await fetch('/api/history');
      const data = await res.json();

      historyList.innerHTML = '';
      if (!data || data.length === 0) {
        historyList.innerHTML = `<div class="history-empty" style="text-align: center; color: #94a3b8; padding: 20px;">Chưa có hồ sơ nào được lưu.</div>`;
        return;
      }

      data.forEach(item => {
        const div = document.createElement('div');
        div.className = 'history-item';

        let scoreClass = 'score-high';
        if (item.score < 50) scoreClass = 'score-low';
        else if (item.score < 75) scoreClass = 'score-mid';

        div.innerHTML = `
          <div class="history-item-left">
            <span class="history-name">${escapeHtml(item.name)}</span>
            <span class="history-date">${item.date}</span>
          </div>
          <span class="history-score-badge ${scoreClass}">${item.score !== null ? item.score + ' pt' : 'N/A'}</span>
        `;

        div.addEventListener('click', () => {
          const targetFile = item.filename || `REPORT_${sanitizeName(item.name)}.json`;
          fetch(`/api/report/json?file=${encodeURIComponent(targetFile)}`)
            .then(r => r.json())
            .then(reportData => {
              addLog('info', `📂 Đã tải hồ sơ lịch sử của KOL "${item.name}"`);
              reportData.filename = targetFile;
              renderReport(reportData);
            })
            .catch(err => addLog('error', `Lỗi tải hồ sơ: ${err.message}`));
        });

        historyList.appendChild(div);
      });
    } catch (err) {
      console.error('Error loading history:', err);
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function sanitizeName(name) {
    return name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }
});
