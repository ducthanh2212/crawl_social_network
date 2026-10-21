import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Job State Management
interface LogEntry {
  level: 'info' | 'warn' | 'error' | 'success' | 'system';
  message: string;
  time: string;
}

interface AuditJob {
  jobId: string;
  target: string;
  domain: string;
  status: 'idle' | 'running' | 'completed' | 'error';
  phase: string;
  logs: LogEntry[];
  report: any | null;
  errorMessage?: string;
  lastReadIndex: Map<string, number>; // client polling tracking
}

const jobs = new Map<string, AuditJob>();

// Helper sanitize
function sanitizeName(name: string): string {
  return name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

// POST /api/audit - Trigger E2E audit campaign
app.post('/api/audit', async (req: Request, res: Response) => {
  try {
    const { target, domain = 'Tổng hợp', autoKeywords = true, keywords = [], maxPosts = 8, maxComments = 12, headless = true } = req.body;

    if (!target) {
      return res.status(400).json({ success: false, error: 'Vui lòng nhập tên KOL / Influencer' });
    }

    const jobId = `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const job: AuditJob = {
      jobId,
      target,
      domain,
      status: 'running',
      phase: 'Khởi tạo tiến trình...',
      logs: [],
      report: null,
      lastReadIndex: new Map(),
    };

    jobs.set(jobId, job);

    // Build CLI arguments wrapped securely in quotes
    const args = [
      'src/index.ts',
      `--target="${target}"`,
      `--domain="${domain}"`,
      `--maxPosts=${maxPosts}`,
      `--maxComments=${maxComments}`,
      `--headless=${headless}`
    ];

    if (autoKeywords) {
      args.push('--autoKeywords=true');
    } else if (Array.isArray(keywords) && keywords.length > 0) {
      args.push(`--keywords="${keywords.join(',')}"`);
    }

    job.logs.push({
      level: 'system',
      message: `Khởi chạy tiến trình cào dữ liệu cho target "${target}"...`,
      time: new Date().toLocaleTimeString('vi-VN')
    });

    // Spawn crawler process via tsx / node with exact env vars to prevent Windows shell space splitting
    const child = spawn('npx', ['tsx', ...args], {
      cwd: path.join(__dirname, '..'),
      env: {
        ...process.env,
        FORCE_COLOR: '0',
        AUDIT_TARGET: target,
        AUDIT_DOMAIN: domain,
        AUDIT_KEYWORDS: JSON.stringify(keywords),
        AUDIT_AUTO_KEYWORDS: String(autoKeywords),
      },
      shell: true
    });

    child.stdout.on('data', (data) => {
      const lines = data.toString().split('\n').filter((l: string) => l.trim());
      lines.forEach((line: string) => {
        let level: LogEntry['level'] = 'info';
        if (line.includes('ERROR') || line.includes('❌') || line.includes('Failed')) level = 'error';
        else if (line.includes('WARN') || line.includes('⚠️')) level = 'warn';
        else if (line.includes('✅') || line.includes('SUCCESS') || line.includes('🎉')) level = 'success';
        else if (line.includes('Phase') || line.includes('🚀')) level = 'system';

        // Update phase indicator based on keywords
        if (line.includes('[Phase 1]')) job.phase = 'Phase 1: Kiểm tra Session FB...';
        else if (line.includes('[Phase 2]')) job.phase = 'Phase 2: Bắt GraphQL & Bài viết...';
        else if (line.includes('[Phase 3]')) job.phase = 'Phase 3: Cào bình luận gốc & replies...';
        else if (line.includes('[Phase 4]')) job.phase = 'Phase 4: Lọc rác & Chuẩn hóa Zod...';
        else if (line.includes('[Phase 5]')) job.phase = 'Phase 5: AI Gemini Thẩm định rủi ro...';
        else if (line.includes('[Phase 6]')) job.phase = 'Phase 6: Xuất hồ sơ Báo cáo...';

        job.logs.push({
          level,
          message: line,
          time: new Date().toLocaleTimeString('vi-VN')
        });
      });
    });

    child.stderr.on('data', (data) => {
      const msg = data.toString().trim();
      if (msg && !msg.includes('Debugger attached')) {
        job.logs.push({
          level: 'error',
          message: msg,
          time: new Date().toLocaleTimeString('vi-VN')
        });
      }
    });

    child.on('close', (code) => {
      if (code === 0) {
        job.status = 'completed';
        job.phase = 'Hoàn tất!';
        job.logs.push({
          level: 'success',
          message: `🎉 Thẩm định Brand Safety cho "${target}" đã hoàn tất xuất sắc!`,
          time: new Date().toLocaleTimeString('vi-VN')
        });

        // Try to load generated JSON report
        const sanitized = sanitizeName(target);
        const reportJsonPath = path.join(__dirname, `../data/processed/REPORT_${sanitized}.json`);
        if (fs.existsSync(reportJsonPath)) {
          try {
            const raw = fs.readFileSync(reportJsonPath, 'utf-8');
            job.report = JSON.parse(raw);
          } catch (e: any) {
            job.logs.push({ level: 'warn', message: `Không đọc được JSON report: ${e.message}`, time: new Date().toLocaleTimeString('vi-VN') });
          }
        }
      } else {
        job.status = 'error';
        job.errorMessage = `Tiến trình kết thúc với mã lỗi ${code}`;
        job.logs.push({
          level: 'error',
          message: `❌ Tiến trình dừng đột ngột (Code: ${code})`,
          time: new Date().toLocaleTimeString('vi-VN')
        });
      }
    });

    return res.json({ success: true, jobId });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/status - Poll status & streaming logs
app.get('/api/status', (req: Request, res: Response) => {
  const jobId = req.query.jobId as string;
  if (!jobId || !jobs.has(jobId)) {
    return res.status(404).json({ error: 'Job ID không tồn tại' });
  }

  const job = jobs.get(jobId)!;
  const clientKey = req.ip || 'default';
  const lastIdx = job.lastReadIndex.get(clientKey) || 0;

  const newLogs = job.logs.slice(lastIdx);
  job.lastReadIndex.set(clientKey, job.logs.length);

  return res.json({
    status: job.status,
    phase: job.phase,
    logs: newLogs,
    report: job.report,
    errorMessage: job.errorMessage
  });
});

// GET /api/history - Get recent audit history
app.get('/api/history', (_req: Request, res: Response) => {
  try {
    const processedDir = path.join(__dirname, '../data/processed');
    if (!fs.existsSync(processedDir)) {
      return res.json([]);
    }

    const files = fs.readdirSync(processedDir).filter(f => f.startsWith('REPORT_') && f.endsWith('.json'));
    const list: any[] = [];

    for (const file of files) {
      try {
        const fullPath = path.join(processedDir, file);
        const stat = fs.statSync(fullPath);
        const data = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
        const scoreVal = data.executiveSummary?.brandSafetyScore !== undefined 
          ? data.executiveSummary.brandSafetyScore 
          : (data.brandSafetyScore !== undefined ? data.brandSafetyScore : null);
        list.push({
          filename: file,
          name: data.kolName || data.targetKol || file.replace('REPORT_', '').replace('.json', ''),
          score: scoreVal,
          date: new Date(stat.mtime).toLocaleDateString('vi-VN') + ' ' + new Date(stat.mtime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
        });
      } catch (e) {
        // Skip malformed
      }
    }

    // Sort newest first
    list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return res.json(list);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/report/json - Get specific JSON report
app.get('/api/report/json', (req: Request, res: Response) => {
  const file = req.query.file as string;
  if (!file) return res.status(400).json({ error: 'Thiếu tham số file' });

  const safePath = path.join(__dirname, '../data/processed', path.basename(file));
  if (!fs.existsSync(safePath)) return res.status(404).json({ error: 'Hồ sơ không tồn tại' });

  try {
    const data = JSON.parse(fs.readFileSync(safePath, 'utf-8'));
    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/report/download - Download file
app.get('/api/report/download', (req: Request, res: Response) => {
  const file = req.query.file as string;
  if (!file) return res.status(400).send('Thiếu tham số file');

  const safePath = path.join(__dirname, '../data/processed', path.basename(file));
  if (!fs.existsSync(safePath)) return res.status(404).send('File không tồn tại');

  return res.download(safePath);
});

app.listen(PORT, () => {
  console.log(`===================================================================`);
  console.log(`🌟 [WEB UI READY] Facebook KOL Brand Safety AI Auditor Dashboard`);
  console.log(`🌐 Truy cập ngay tại: http://localhost:${PORT}`);
  console.log(`===================================================================`);
});

// Prevent premature exit when run under background task runners
setInterval(() => {}, 1000 * 60 * 60);
