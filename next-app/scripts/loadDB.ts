/**
 * Full seed (resumable): npm run seed
 *
 * In this script I'm building a complete, end‑to‑end seed for a SCOTUS RAG database.
 * I rely on CourtListener's public API v4 for both case metadata and full opinion texts,
 * because it's stable, well‑documented, and returns the exact fields I need.
 *
 * Data model (two Astra collections):
 *   1) cases     — one doc per case/cluster (stable id = cl:<cluster_id>)
 *                  I also mark `indexed=true` once all opinions are processed, so re-runs skip it.
 *   2) opinions  — many docs per case; each is a *chunk* from a specific opinion section
 *                  (majority, concurrence, dissent, syllabus, etc.). Each chunk has a vector.
 *
 * Resuming behavior:
 *   - I save a checkpoint (the API "next" URL) after each clusters page in a `seed_control` collection.
 *   - On startup (with RESUME=true), I read that checkpoint and start from the saved `next` URL.
 *   - At the case level, I skip anything already `indexed=true`.
 *
 * Notes:
 *   - Date range defaults to 2000 → current year (configurable via .env).
 *   - I batch embeddings per opinion to reduce latency and cost.
 *   - I dedupe chunks by (case_id, opinion_id, content_hash) so re‑runs are safe.
 *   - This is non‑commercial use.
 */

import 'dotenv/config';

import { DataAPIClient } from '@datastax/astra-db-ts';
import OpenAI from 'openai';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import crypto from 'crypto';

// ---------- Environment & validation (I prefer to fail fast) ----------
type SimilarityMetric = 'dot_product' | 'cosine' | 'euclidean';

const {
  ASTRA_DB_API_ENDPOINT,
  ASTRA_DB_APPLICATION_TOKEN,
  ASTRA_DB_KEYSPACE,                 // v2 client expects keyspace (not namespace)
  OPENAI_API_KEY,

  ASTRA_DB_COLLECTION_CASES,
  ASTRA_DB_COLLECTION_OPINIONS,
  ASTRA_DB_COLLECTION_CONTROL,

  // Easy date controls without touching code
  SEED_START_YEAR,
  SEED_END_YEAR,

  // Allow multiple jobs (different windows) to checkpoint independently
  SEED_JOB_ID,  // optional; I’ll default below

  // CourtListener base + headers
  COURTLISTENER_BASE = 'https://www.courtlistener.com',
  COURTLISTENER_CONTACT = 'you@example.com',     // please set your email in .env
  COURTLISTENER_TOKEN,                           // optional but recommended

  // Resume behavior (default true)
  RESUME: RESUME_ENV
} = process.env as Record<string, string | undefined>;

if (!ASTRA_DB_API_ENDPOINT || !ASTRA_DB_APPLICATION_TOKEN || !ASTRA_DB_KEYSPACE) {
  throw new Error('Please set ASTRA_DB_API_ENDPOINT, ASTRA_DB_APPLICATION_TOKEN, and ASTRA_DB_KEYSPACE in your .env');
}
if (!OPENAI_API_KEY) {
  throw new Error('Please set OPENAI_API_KEY in your .env');
}

// I default to 2000 → current year, but I let myself override via .env
const START_YEAR = Number(SEED_START_YEAR || 2000);
const END_YEAR = Number(SEED_END_YEAR || new Date().getFullYear());

// This job id lets me resume different windows independently (useful for backfills).
const JOB_ID = SEED_JOB_ID || `scotus_${START_YEAR}_${END_YEAR}`;

// Resume is on by default; set RESUME=false to restart from page 1.
const RESUME = String(RESUME_ENV ?? 'true').toLowerCase() === 'true';

// ---------- Clients & small utilities I reuse ----------
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

/**
 * For legal text I like slightly bigger chunks so paragraphs stay together.
 * I can tune later based on retrieval performance (and cost).
 */
const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 900,
  chunkOverlap: 150
});

const client = new DataAPIClient(ASTRA_DB_APPLICATION_TOKEN!);
const db = client.db(ASTRA_DB_API_ENDPOINT!, { keyspace: ASTRA_DB_KEYSPACE! });

// If you ever run on Node < 18, uncomment the polyfill below:
// const fetchMod = await import('node-fetch'); (global as any).fetch = (fetchMod as any).default;

function sha1(s: string) {
  return crypto.createHash('sha1').update(s, 'utf8').digest('hex');
}
function sleep(ms: number) {
  return new Promise(res => setTimeout(res, ms));
}

// ---------- CourtListener fetch wrapper (headers + retry/backoff + timeout) ----------
/**
 * I centralize HTTP calls so I can:
 *  - send proper headers (User-Agent with my contact, Accept, optional Token)
 *  - handle 403/429/5xx and network errors with exponential backoff + jitter
 *  - enforce a per-request timeout so hangs don’t stall the run
 *  - keep errors readable for portfolio reviewers
 */
async function fetchJsonWithRetry(url: string, purpose: string, attempt = 1): Promise<any> {
  const headers: Record<string, string> = {
    'User-Agent': `scotus-rag/1.0 (${COURTLISTENER_CONTACT})`,
    'Accept': 'application/json'
  };
  if (COURTLISTENER_TOKEN) headers['Authorization'] = `Token ${COURTLISTENER_TOKEN}`;

  const controller = new AbortController();
  const timeoutMs = 45_000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { headers, signal: controller.signal });

    if (res.ok) {
      clearTimeout(timer);
      return res.json();
    }

    const retriableStatuses = [403, 408, 425, 429, 500, 502, 503, 504];
    if (retriableStatuses.includes(res.status) && attempt <= 8) {
      const base = Math.min(30_000, 300 * Math.pow(2, attempt));
      const jitter = Math.floor(Math.random() * 500);
      const wait = base + jitter;
      console.warn(`⚠️  ${purpose}: ${res.status} ${res.statusText}. Backing off ${wait}ms (attempt ${attempt}/8).`);
      await sleep(wait);
      clearTimeout(timer);
      return fetchJsonWithRetry(url, purpose, attempt + 1);
    }

    const body = await res.text().catch(() => '');
    clearTimeout(timer);
    throw new Error(`${purpose}: ${res.status} ${res.statusText} — ${body.slice(0, 300)}`);
  } catch (err: any) {
    clearTimeout(timer);
    const msg = String(err?.message || err);
    if (attempt <= 8) {
      const base = Math.min(30_000, 300 * Math.pow(2, attempt));
      const jitter = Math.floor(Math.random() * 500);
      const wait = base + jitter;
      console.warn(`⚠️  ${purpose}: network error "${msg}". Retrying in ${wait}ms (attempt ${attempt}/8).`);
      await sleep(wait);
      return fetchJsonWithRetry(url, purpose, attempt + 1);
    }
    throw new Error(`${purpose}: network error after retries — ${msg}`);
  }
}

// ---------- Data shapes I store in Astra ----------
type CaseDoc = {
  case_id: string;            // cl:<cluster_id>
  case_name?: string;
  docket?: string;
  decision_date?: string;     // ISO yyyy-mm-dd
  provider: 'courtlistener';
  court: 'US_SCOTUS';
  citations?: string[];       // e.g., ["600 U.S. 123", "145 S. Ct. 456"]
  source_urls: string[];      // endpoints I touched for provenance/debug
  indexed?: boolean;          // I set true when all opinions are processed
  opinions_count?: number;    // optional: number of opinion chunks inserted
};

type OpinionChunk = {
  case_id: string;            // cl:<cluster_id>
  section: 'majority' | 'concurrence' | 'dissent' | 'per_curiam' | 'syllabus' | 'other';
  author?: string;
  opinion_id: string;         // clop:<opinion_id>
  chunk_index: number;        // 0..N within this opinion
  text: string;
  $vector: number[];
  decision_date?: string;
  content_hash: string;       // dedupe on re-run
  source_url: string;         // opinion API URL
};

// ---------- Astra collections ----------
async function createCollections(metric: SimilarityMetric = 'dot_product') {
  try {
    const res = await db.createCollection(ASTRA_DB_COLLECTION_CASES!, {});
    console.log(`[cases] created:`, res);
  } catch (e: any) {
    if (/already exists/i.test(String(e?.message))) {
      console.log('[cases] already exists');
    } else {
      throw e;
    }
  }

  try {
    const res = await db.createCollection(ASTRA_DB_COLLECTION_OPINIONS!, {
      vector: { dimension: 1536, metric }
    });
    console.log(`[opinions] created:`, res);
  } catch (e: any) {
    if (/already exists/i.test(String(e?.message))) {
      console.log('[opinions] already exists');
    } else {
      throw e;
    }
  }

  // new: control collection to store my checkpoint
  try {
    const res = await db.createCollection(ASTRA_DB_COLLECTION_CONTROL!, {});
    console.log(`[control] created:`, res);
  } catch (e: any) {
    if (/already exists/i.test(String(e?.message))) {
      console.log('[control] already exists');
    } else {
      throw e;
    }
  }
}

// ---------- Control-plane helpers (checkpointing) ----------
type SeedCheckpoint = {
  job_id: string;
  start_year: number;
  end_year: number;
  next_url?: string;       // CourtListener "next" URL for the next page
  updated_at: string;      // ISO timestamp (for my own debugging)
};

async function readCheckpoint(): Promise<SeedCheckpoint | null> {
  const control = await db.collection(ASTRA_DB_COLLECTION_CONTROL!);
  const doc = await control.findOne({ job_id: JOB_ID } as any);
  return (doc as any) || null;
}

async function writeCheckpoint(nextUrl: string | undefined) {
  const control = await db.collection(ASTRA_DB_COLLECTION_CONTROL!);
  const cp: SeedCheckpoint = {
    job_id: JOB_ID,
    start_year: START_YEAR,
    end_year: END_YEAR,
    next_url: nextUrl || '',
    updated_at: new Date().toISOString()
  };
  await control.updateOne(
    { job_id: JOB_ID } as any,
    { $set: cp } as any,
    { upsert: true as any }
  );
}

// ---------- CourtListener v4 helpers ----------
/**
 * I build the first page URL for my clusters query:
 *   - scope to SCOTUS via docket__court=scotus
 *   - filter date range via date_filed__gte/lte (v4 Django lookups)
 *   - order newest first so sanity checks are obvious
 *   - request only fields I need to be a good API citizen
 */
function buildClustersFirstPageUrl(startYear: number, endYear: number) {
  const min = `${startYear}-03-19`;
  const max = `${endYear}-12-01`;
  const fields = [
    'id',
    'case_name',
    'case_name_full',
    'date_filed',
    'docket',
    'citations',
    'sub_opinions'
  ].join(',');

  return (
    `${COURTLISTENER_BASE}/api/rest/v4/clusters/` +
    `?docket__court=scotus` +
    `&date_filed__gte=${encodeURIComponent(min)}` +
    `&date_filed__lte=${encodeURIComponent(max)}` +
    `&page_size=100` +
    `&order_by=date_filed` +   // newest first
    `&fields=${encodeURIComponent(fields)}`
  );
}

/**
 * I fetch all opinions for a cluster via v4 and request only the fields I need.
 */
async function fetchOpinionsForCluster(clusterId: number) {
  const fields = [
    'id',
    'type',
    'author',
    'author_str',
    'plain_text',
    'html_with_citations',
    'html'
  ].join(',');

  let url =
    `${COURTLISTENER_BASE}/api/rest/v4/opinions/` +
    `?cluster=${clusterId}&page_size=100&order_by=id&fields=${encodeURIComponent(fields)}`;

  const results: any[] = [];
  while (url) {
    const json: any = await fetchJsonWithRetry(url, `fetch opinions for cluster ${clusterId}`);
    results.push(...(json.results || []));
    url = json.next || '';
    if (url) await sleep(200);
  }
  return results;
}

/**
 * I prefer `plain_text` when available. If it's missing, I fall back to HTML and strip it.
 */
function extractOpinionText(op: any): string {
  const pt = (op.plain_text || '').trim();
  if (pt) return pt;

  const html = (op.html_with_citations || op.html || '').trim();
  if (!html) return '';

  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * I normalize the opinion type into my section enum.
 */
function normalizeSection(type: string | null | undefined): OpinionChunk['section'] {
  const t = (type || '').toLowerCase();
  if (t.includes('majority')) return 'majority';
  if (t.includes('concurr')) return 'concurrence';
  if (t.includes('dissent')) return 'dissent';
  if (t.includes('per curiam') || t.includes('per_curiam')) return 'per_curiam';
  if (t.includes('syllabus')) return 'syllabus';
  return 'other';
}

/**
 * Batch embeddings keep latency and cost down. I skip empty inputs.
 */
async function embedBatch(texts: string[]) {
  const inputs = texts.map(t => t.trim()).filter(Boolean);
  if (inputs.length === 0) return [];

  const resp = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: inputs,
    encoding_format: 'float'
  });

  return resp.data.map(d => d.embedding as number[]);
}

// ---------- Astra helpers ----------
async function upsertCase(doc: CaseDoc) {
  const cases = await db.collection(ASTRA_DB_COLLECTION_CASES!);
  await cases.updateOne(
    { case_id: doc.case_id },
    { $set: doc },
    { upsert: true as any }
  );
}

/**
 * I dedupe by (case_id, opinion_id, content_hash) so re-runs don't create duplicates.
 * I also insert in small batches to avoid payload limits.
 */
async function insertOpinionChunks(docs: OpinionChunk[]) {
  if (!docs.length) return;
  const opinions = await db.collection(ASTRA_DB_COLLECTION_OPINIONS!);

  const BATCH = 40;
  let inserted = 0;

  for (let i = 0; i < docs.length; i += BATCH) {
    const slice = docs.slice(i, i + BATCH);

    const toInsert: OpinionChunk[] = [];
    for (const d of slice) {
      const exists = await opinions.findOne(
        { case_id: d.case_id, opinion_id: d.opinion_id, content_hash: d.content_hash },
        { projection: { _id: 1 } as any }
      );
      if (!exists) toInsert.push(d);
    }

    if (toInsert.length) {
      await opinions.insertMany(toInsert as any);
      inserted += toInsert.length;
    }
  }

  console.log(`   ↳ inserted ${inserted} new chunks`);
  return inserted;
}

// ---------- Per‑cluster ingestion ----------
async function processCluster(cluster: any) {
  // I create a stable case_id based on CourtListener's cluster id
  const clusterId: number = cluster.id;
  const case_id = `cl:${clusterId}`;

  // quick skip if already fully indexed
  const casesCol = await db.collection(ASTRA_DB_COLLECTION_CASES!);
  const existing = await casesCol.findOne(
    { case_id } as any,
    { projection: { indexed: 1 } as any }
  );
  if (existing?.indexed === true) {
    console.log(`   ⏭️  already indexed: ${case_id}`);
    return;
  }

  // I store the key metadata for this case in `cases`
  const decision_date: string | undefined = cluster.date_filed || undefined;

  // defensive date guard in case the API ever returns a stray item
  const min = `${START_YEAR}-01-01`;
  const max = `${END_YEAR}-12-31`;
  if (decision_date && (decision_date < min || decision_date > max)) {
    console.log(`   ⏭️  skipping ${case_id} with date ${decision_date} (out of ${min}..${max})`);
    return;
  }

  const caseDoc: CaseDoc = {
    case_id,
    case_name: cluster.case_name || cluster.case_name_full || undefined,
    docket: cluster.docket || cluster.docket_number || undefined,
    decision_date,
    provider: 'courtlistener',
    court: 'US_SCOTUS',
    citations: Array.isArray(cluster.citations)
      ? (cluster.citations.map((c: any) => (c.cite || '').trim()).filter(Boolean))
      : undefined,
    source_urls: [
      `${COURTLISTENER_BASE}/api/rest/v4/clusters/${clusterId}/`
    ],
    indexed: false
  };

  await upsertCase(caseDoc);

  // I fetch all opinions for this case
  const opinions = await fetchOpinionsForCluster(clusterId);
  if (!opinions.length) {
    console.log(` - no opinions found for ${caseDoc.case_name ?? case_id}`);
    // still mark indexed to avoid revisiting this empty case
    await casesCol.updateOne({ case_id } as any, { $set: { indexed: true, opinions_count: 0 } } as any, { upsert: true as any });
    return;
  }

  let totalInserted = 0;

  // For each opinion, I normalize text → split → embed → insert
  for (const op of opinions) {
    const opinionId = op.id;
    const section = normalizeSection(op.type || op.opinion_type);
    const author = (op.author_str || op.author || '').trim() || undefined;
    const text = extractOpinionText(op);

    if (!text) continue;

    const chunks = await splitter.splitText(text);
    if (!chunks.length) continue;

    // I embed opinion chunks in one call to keep memory/cost predictable
    const vectors = await embedBatch(chunks);

    const docs: OpinionChunk[] = chunks.map((c, i) => ({
      case_id,
      section,
      author,
      opinion_id: `clop:${opinionId}`,
      chunk_index: i,
      text: c,
      $vector: vectors[i],
      decision_date: caseDoc.decision_date,
      content_hash: sha1(`${opinionId}:${i}:${c}`),
      source_url: `${COURTLISTENER_BASE}/api/rest/v4/opinions/${opinionId}/`
    }));

    const inserted = await insertOpinionChunks(docs);
    totalInserted += inserted || 0;

    // tiny pause to be polite to the API
    await sleep(150);
  }

  // mark case as fully indexed so re-runs skip it immediately
  await casesCol.updateOne(
    { case_id } as any,
    { $set: { indexed: true, opinions_count: totalInserted } } as any,
    { upsert: true as any }
  );
}

// ---------- Orchestrator (page-by-page with checkpoint) ----------
async function loadAllCases() {
  const firstUrl = buildClustersFirstPageUrl(START_YEAR, END_YEAR);

  let url = firstUrl;
  if (RESUME) {
    const cp = await readCheckpoint();
    if (cp?.next_url) {
      url = cp.next_url;
      console.log(`🔁 RESUME enabled. Starting from checkpoint next_url:\n${url}`);
    } else {
      console.log('🔁 RESUME enabled but no checkpoint found. Starting from the first page.');
    }
  } else {
    console.log('⏩ RESUME disabled. Starting from the first page.');
  }

  let page = 0;
  let totalClusters = 0;

  while (url) {
    page += 1;
    console.log(`\n🔗 clusters URL [page ${page}]: ${url}`);

    const json: any = await fetchJsonWithRetry(url, 'fetch clusters page');

    const results = json.results || [];
    for (const cluster of results) {
      // extra safety: keep only items within our desired date window
      const df: string = (cluster.date_filed || '').slice(0, 10);
      const min = `${START_YEAR}-01-01`;
      const max = `${END_YEAR}-5-01`;
      if (df && (df < min || df > max)) continue;

      totalClusters += 1;
      const label = (cluster.case_name || cluster.case_name_full || `cluster ${cluster.id}`);
      console.log(`📁 [${totalClusters}] ${label} — docket: ${cluster.docket || cluster.docket_number || 'n/a'} — date: ${cluster.date_filed || 'n/a'}`);

      try {
        await processCluster(cluster);
      } catch (e: any) {
        console.error(`   ❌ failed on ${label}: ${e?.message || e}`);
      }
    }

    // compute next page url and write checkpoint so a crash repeats at most one page
    const nextUrl: string | undefined = json.next || '';
    await writeCheckpoint(nextUrl);

    if (nextUrl) await sleep(250);
    url = nextUrl;
  }

  console.log(`\n✅ Finished ingesting ${totalClusters} clusters (cases).`);
}

// ---------- Entry point ----------
async function main() {
  console.log(`🚀 Seeding SCOTUS (CourtListener v4) from ${START_YEAR}-01-01 to ${END_YEAR}-5-01`);
  console.log(`🔧 Job ID: ${JOB_ID} — Resume: ${RESUME ? 'ON' : 'OFF'}`);
  await createCollections('dot_product');
  await loadAllCases();
  console.log('\n🎉 Database is fully populated: cases + opinions (with vectors).');
  console.log('   You can now filter in `cases` and vector-search in `opinions` by `case_id`.');
}

main().catch((e) => {
  console.error('Fatal error in seed:', e);
  process.exit(1);
});

export { loadAllCases };