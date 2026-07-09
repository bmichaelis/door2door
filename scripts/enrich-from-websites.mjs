#!/usr/bin/env node
// Enrich a kinda-crm contacts CSV by scraping each business's own website for a
// contact Email (high yield) and, best-effort, a Contact Person name (low yield).
//
// Input/output are the CSV shape produced by export-to-kinda-crm.mjs.
// Only rows that have a Website and an empty Email are fetched; everything else
// passes through untouched. Run this BEFORE importing into kinda-crm (the
// importer skips duplicates, so it won't back-fill an email onto a row you
// already imported).
//
// Usage:
//   node scripts/enrich-from-websites.mjs --input=exports/kinda-crm-contacts-part-01.csv [flags]
//
// Flags:
//   --input=FILE         CSV to enrich (required)
//   --out=FILE           output path (default: <input> with .enriched.csv)
//   --limit=N            only process the first N website-bearing rows (test runs)
//   --concurrency=N      parallel fetches (default: 12)
//   --timeout=MS         per-request timeout (default: 8000)

import { readFileSync, writeFileSync } from 'node:fs'

const flags = {}
for (const arg of process.argv.slice(2)) {
  const m = arg.match(/^--([^=]+)(?:=(.*))?$/)
  if (m) flags[m[1]] = m[2] ?? true
}
const inputPath = typeof flags.input === 'string' ? flags.input : null
if (!inputPath) {
  console.error('Missing --input=FILE. Example:\n  node scripts/enrich-from-websites.mjs --input=exports/kinda-crm-contacts-part-01.csv')
  process.exit(1)
}
const outPath = typeof flags.out === 'string' ? flags.out : inputPath.replace(/\.csv$/i, '') + '.enriched.csv'
const limit = typeof flags.limit === 'string' ? Number(flags.limit) : Infinity
const concurrency = typeof flags.concurrency === 'string' ? Math.max(1, Number(flags.concurrency)) : 12
const timeoutMs = typeof flags.timeout === 'string' ? Number(flags.timeout) : 8000

const UA = 'Mozilla/5.0 (compatible; door2door-enrich/1.0; +local-crm-tooling)'
const MAX_BYTES = 600_000

// ---------- CSV (RFC-4180-ish) ----------
function parseCsv(text) {
  const rows = []
  let row = [], field = '', inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else field += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.length > 1 || row[0] !== '') rows.push(row)
      row = []
    } else field += c
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row) }
  const [header, ...body] = rows
  return { header, records: body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? '']))) }
}

function csvCell(v) {
  const s = v == null ? '' : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
function toCsv(header, records) {
  const lines = [header, ...records.map((rec) => header.map((h) => rec[h] ?? ''))]
  return lines.map((cells) => cells.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

// ---------- extraction ----------
const BAD_DOMAINS = ['sentry.io', 'sentry-cdn', 'wixpress.com', 'wix.com', 'example.com', 'example.org',
  'godaddy.com', 'squarespace.com', 'schema.org', 'w3.org', 'googleapis.com', 'gstatic.com', 'jsdelivr.net',
  'cloudflare.com', 'fontawesome.com', 'sentry.wixpress.com', 'domain.com', 'email.com', 'yourdomain.com']
const BAD_LOCALPARTS = ['example', 'yourname', 'youremail', 'someone', 'user', 'name', 'email', 'firstname', 'lastname']
const ASSET_EXT = /\.(png|jpe?g|gif|webp|avif|bmp|tiff?|svg|css|js|ico|woff2?|ttf)$/i

function cleanEmails(raw, siteDomain) {
  const seen = new Set()
  const out = []
  for (let e of raw) {
    e = e.toLowerCase().replace(/^mailto:/, '').split('?')[0].trim()
    if (!/^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/.test(e)) continue
    if (ASSET_EXT.test(e)) continue
    if (/@[0-9]+x\./.test(e)) continue          // retina srcset: foo@2x.avif
    if (/\d{2,}x\d{2,}/.test(e)) continue        // image dimensions in name: 300x37
    const [local, domain] = e.split('@')
    if (BAD_DOMAINS.some((d) => domain.includes(d))) continue
    if (BAD_LOCALPARTS.includes(local)) continue
    if (/[a-f0-9]{16,}/.test(local)) continue // sentry-style hashes
    if (seen.has(e)) continue
    seen.add(e); out.push({ email: e, domain })
  }
  // rank: domain matches the site > preferred mailbox names > anything
  const prefer = ['info', 'contact', 'hello', 'sales', 'office', 'admin', 'owner']
  out.sort((a, b) => {
    const am = siteDomain && a.domain.includes(siteDomain) ? 0 : 1
    const bm = siteDomain && b.domain.includes(siteDomain) ? 0 : 1
    if (am !== bm) return am - bm
    const ap = prefer.indexOf(a.email.split('@')[0]); const bp = prefer.indexOf(b.email.split('@')[0])
    return (ap === -1 ? 99 : ap) - (bp === -1 ? 99 : bp)
  })
  return out.map((o) => o.email)
}

function extractEmails(html, siteDomain) {
  const mailto = [...html.matchAll(/mailto:([^"'?>\s]+)/gi)].map((m) => m[1])
  const inline = [...html.matchAll(/[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/gi)].map((m) => m[0])
  return cleanEmails([...mailto, ...inline], siteDomain)
}

function extractName(html) {
  // JSON-LD founder/owner or Person name
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(m[1].trim())
      for (const node of Array.isArray(data) ? data : [data]) {
        const person = node.founder || node.owner
        const name = typeof person === 'string' ? person : person?.name
        if (name && /^[A-Z][a-z]+ [A-Z][a-z'\-]+$/.test(name)) return name
      }
    } catch { /* ignore malformed JSON-LD */ }
  }
  // "Owner: Jane Doe" / "Founded by John Smith"
  const text = html.replace(/<[^>]+>/g, ' ')
  const m = text.match(/(?:owner|founder|proprietor|founded by)\s*[:\-–]?\s*([A-Z][a-z]+ [A-Z][a-z'\-]+)/)
  return m ? m[1] : ''
}

// ---------- fetch ----------
function normalizeUrl(u) {
  if (!u) return null
  const s = u.trim()
  if (!/^https?:\/\//i.test(s)) return 'https://' + s
  return s
}
function registrableDomain(u) {
  try { return new URL(normalizeUrl(u)).hostname.replace(/^www\./, '') } catch { return '' }
}

async function fetchText(url) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { redirect: 'follow', signal: ctrl.signal, headers: { 'user-agent': UA, accept: 'text/html' } })
    if (!res.ok) return ''
    if (!(res.headers.get('content-type') || '').includes('text/html')) return ''
    const buf = await res.arrayBuffer()
    return Buffer.from(buf.slice(0, MAX_BYTES)).toString('utf8')
  } catch {
    return ''
  } finally {
    clearTimeout(t)
  }
}

function contactLink(html, baseUrl) {
  const m = html.match(/href\s*=\s*["']([^"']*(?:contact|about)[^"']*)["']/i)
  if (!m) return null
  try { return new URL(m[1], baseUrl).href } catch { return null }
}

async function enrichRow(rec) {
  const url = normalizeUrl(rec.Website)
  if (!url) return { email: '', name: '', fetched: false }
  const siteDomain = registrableDomain(url)
  const home = await fetchText(url)
  if (!home) return { email: '', name: '', fetched: false }
  let emails = extractEmails(home, siteDomain)
  let name = extractName(home)
  if (emails.length === 0) {
    const cl = contactLink(home, url)
    if (cl && cl !== url) {
      const page = await fetchText(cl)
      if (page) { emails = extractEmails(page, siteDomain); if (!name) name = extractName(page) }
    }
  }
  return { email: emails[0] || '', name, fetched: true }
}

// ---------- run ----------
const { header, records } = parseCsv(readFileSync(inputPath, 'utf8'))
const targets = records.filter((r) => (r.Website || '').trim() && !(r.Email || '').trim()).slice(0, limit)
console.log(`Loaded ${records.length} rows; ${targets.length} have a website + no email → scraping (concurrency ${concurrency}, timeout ${timeoutMs}ms).`)

let done = 0, gotEmail = 0, gotName = 0, fetched = 0
let cursor = 0
async function worker() {
  while (cursor < targets.length) {
    const rec = targets[cursor++]
    const { email, name, fetched: ok } = await enrichRow(rec)
    if (ok) fetched++
    if (email) { rec.Email = email; gotEmail++ }
    if (name && !(rec['Contact Person'] || '').trim()) { rec['Contact Person'] = name; gotName++ }
    if (++done % 25 === 0 || done === targets.length) {
      process.stdout.write(`\r  ${done}/${targets.length} processed — ${gotEmail} emails, ${gotName} names`)
    }
  }
}
await Promise.all(Array.from({ length: concurrency }, worker))
process.stdout.write('\n')

writeFileSync(outPath, toCsv(header, records))
console.log(`\nSites fetched OK: ${fetched}/${targets.length}`)
console.log(`Emails found:     ${gotEmail}`)
console.log(`Names found:      ${gotName}  (best-effort — websites rarely name the owner)`)
console.log(`\nWrote ${records.length} rows → ${outPath}`)
console.log('Review the emails before importing; site-scraped addresses can be generic (info@…) or stale.')
