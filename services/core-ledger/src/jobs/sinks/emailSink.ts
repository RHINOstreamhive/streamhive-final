import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import mime from 'mime-types';

// ✅ add these two lines for ESM (__dirname replacement)
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type Hit = { year: number; type: string; outDir: string; file: string };

const STATE_FILE = path.resolve(__dirname, '../../../data/email-sink.state.json');
const RETURNS_ROOT = path.resolve(__dirname, '../../../returns');

function ensureDir(p: string) { fs.mkdirSync(p, { recursive: true }); }
function sanitize(name: string) {
  return name.replace(/[^\w.\-+@]/g, '_').replace(/_+/g, '_').slice(0, 160);
}
function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return { y, tag: `${y}-${m}-${dd}` };
}
function p(type: string, year: number) {
  return path.join(RETURNS_ROOT, String(year), type);
}

// --- classify emails → target folders ---------------------------------------
function classify(from: string, subject: string, date: Date, attachmentNames: string[] = []): Hit[] {
  const s = subject.toLowerCase();
  const f = from.toLowerCase();
  const names = attachmentNames.map(n => (n || '').toLowerCase());

  // strong keywords – if these appear in subject or filename, we treat as that form
  const has = (re: RegExp) => re.test(s) || names.some(n => re.test(n));

  // try pull year from subject/filename; fall back to message date
  const yearFromText = (() => {
    const m = (s.match(/\b(20\d{2})\b/) || names.map(n => n.match(/\b(20\d{2})\b/)).find(Boolean)) as RegExpMatchArray | null;
    return m ? Number(m[1]) : undefined;
  })();
  const y = yearFromText ?? date.getFullYear();

  // “is this likely SARS” (still helps but no longer required)
  const isSars =
    f.includes('@sars.gov.za') ||
    /\bsars\b|\befiling\b/i.test(subject) ||
    /\bsars\b/.test(names.join(' '));

  const hits: Hit[] = [];

  // ITR14 / ITA34 (company tax assessment)
  if (has(/\bita34\b|\bitr14\b|assessment/i)) {
    hits.push({ year: y, type: 'ITR14', outDir: p('ITR14', y), file: 'ITA34.pdf' });
  }

  // Provisional tax IRP6 (Feb/Aug)
  if (has(/\birp6\b|\bprovisional\b/)) {
    if (has(/\bfeb(?:ruary)?\b/)) hits.push({ year: y, type: 'IRP6', outDir: p('IRP6', y), file: 'IRP6-Feb.pdf' });
    if (has(/\baug(?:ust)?\b/)) hits.push({ year: y, type: 'IRP6', outDir: p('IRP6', y), file: 'IRP6-Aug.pdf' });
    if (!hits.some(h => h.type === 'IRP6')) {
      const m = date.getMonth() + 1;
      hits.push({
        year: y,
        type: 'IRP6',
        outDir: p('IRP6', y),
        file: m <= 6 ? 'IRP6-Feb.pdf' : 'IRP6-Aug.pdf',
      });
    }
  }

  // Payroll: EMP201 (monthly) and EMP501 (Jun/Nov reconciliation)
  if (has(/\bemp201\b/)) {
    const mm = (s.match(/\b(0[1-9]|1[0-2])\b/)?.[1]) ||
      (names.map(n => n.match(/\b(0[1-9]|1[0-2])\b/)).find(Boolean)?.[1]) ||
      String(date.getMonth() + 1).padStart(2, '0');
    hits.push({ year: y, type: 'EMP', outDir: p('EMP', y), file: `EMP201-${y}-${mm}.pdf` });
  }
  if (has(/\bemp501\b|\brecon\b/)) {
    const half = has(/\bjun(e)?\b/) ? 'Jun' : has(/\bnov(ember)?\b/) ? 'Nov' : 'Recon';
    hits.push({ year: y, type: 'EMP', outDir: p('EMP', y), file: `EMP501-${half}.pdf` });
  }

  // VAT201
  if (has(/\bvat\s*201\b|\bvat201\b|\bvat return\b/i)) {
    const mm = (s.match(/\b(0[1-9]|1[0-2])\b/)?.[1]) ||
      (names.map(n => n.match(/\b(0[1-9]|1[0-2])\b/)).find(Boolean)?.[1]) ||
      String(date.getMonth() + 1).padStart(2, '0');
    hits.push({ year: y, type: 'VAT', outDir: p('VAT', y), file: `VAT201-${y}-${mm}.pdf` });
  }

  // Bank statements
  if (has(/\bstatement\b/) && /(fnb|standard bank|absa|nedbank|tyme|capitec)/i.test(f + ' ' + s + ' ' + names.join(' '))) {
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    hits.push({ year: y, type: 'BANK', outDir: p('BANK', y), file: `BankStatements-${y}-${mm}.pdf` });
  }

  // Fallback: if looks SARS-ish + PDF but didn’t classify
  if (!hits.length && isSars && has(/\.pdf$/i)) {
    hits.push({ year: y, type: 'ITR14', outDir: p('ITR14', y), file: `SARS-${y}.pdf` });
  }

  return hits;
}

function pickName(hits: Hit[], origName: string | false, date: Date, idx: number, contentType?: string) {
  const ext = (origName && path.extname(origName)) || '.' + (mime.extension(contentType || '') || 'bin');
  if (hits.length === 1 && hits[0].file) return hits[0].file;
  const { y, tag } = ymd(date);
  return sanitize(origName ? origName : `Attachment-${y}-${tag}-${idx}${ext}`);
}

// --- state -------------------------------------------------------------------
type State = { lastUid?: number };
function loadState(): State {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return {}; }
}
function saveState(s: State) {
  ensureDir(path.dirname(STATE_FILE));
  fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
}

// --- main --------------------------------------------------------------------
async function main() {
  const { IMAP_HOST, IMAP_PORT, IMAP_USER, IMAP_PASS, IMAP_TLS, IMAP_FOLDER } = process.env;
  if (!IMAP_HOST || !IMAP_USER || !IMAP_PASS) throw new Error('Missing IMAP env: IMAP_HOST, IMAP_USER, IMAP_PASS');

  const client = new ImapFlow({
    host: IMAP_HOST,
    port: Number(IMAP_PORT) || 993,
    secure: IMAP_TLS !== 'false',
    auth: { user: IMAP_USER, pass: IMAP_PASS },
    logger: console, // keep verbose logs
  });

  const state = loadState();

  await client.connect();
  await client.mailboxOpen(IMAP_FOLDER || 'INBOX');

  const seq = state.lastUid ? `${state.lastUid + 1}:*` : '1:*';

  for await (const msg of client.fetch({ uid: seq }, { envelope: true, internalDate: true, source: true })) {
    const uid = msg.uid!;
    const parsed = await simpleParser(msg.source as Buffer);

    const from = parsed.from?.text || (parsed.headers.get('from') as string) || '';
    const subject = parsed.subject || '';
    const date = parsed.date || msg.internalDate || new Date();
    const attNames = (parsed.attachments || []).map(a => a.filename || '');
    const targets = classify(from, subject, date, attNames);

    if (!targets.length || !parsed.attachments?.length) {
      state.lastUid = uid; saveState(state); continue;
    }

    for (let i = 0; i < parsed.attachments.length; i++) {
      const a = parsed.attachments[i];
      const name = pickName(targets, a.filename || false, date, i + 1, a.contentType);
      for (const t of targets) {
        ensureDir(t.outDir);
        const out = path.join(t.outDir, name);
        fs.writeFileSync(out, a.content as Buffer);
        console.log(`📥 Saved ${path.relative(RETURNS_ROOT, out)}  (from: ${from}; subj: ${subject})`);
        fs.appendFileSync(path.join(t.outDir, 'SINK_MANIFEST.log'),
          `${new Date().toISOString()}  ${name}  from="${from}"  subject="${subject}"\n`);
      }
    }

    state.lastUid = uid; saveState(state);
  }

  await client.logout();
}

main().catch((err: any) => {
  console.error(
    'Email sink error:',
    err?.message || err,
    err?.response?.text || err?.response || '',
    err?.command ? `(command: ${err.command})` : ''
  );
  process.exit(1);
});
