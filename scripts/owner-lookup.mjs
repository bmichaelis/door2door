#!/usr/bin/env node
// Just-in-time owner/registered-agent lookup helper.
//
// Utah's official entity search (businessregistration.utah.gov) is a JS app with
// no shareable prefilled-URL, so this generates GET links that land you on the
// business's public record (registered agent + principals are free to view):
//   • Google  — best single "get me the name" click; surfaces the state record,
//               OpenCorporates, Bizapedia, etc. for the business + city
//   • OpenCorporates — deep link to the Utah entity, lists officers/agent
//   • Official — the authoritative Utah portal (paste the name; can't prefill)
//
// Two modes:
//   Single:  node scripts/owner-lookup.mjs --name="Summit Roofing" --city=Orem
//   Batch:   node scripts/owner-lookup.mjs --input=exports/orem/kinda-crm-contacts.enriched.csv
//            → writes a companion <input>.owner-lookups.csv reference sheet
//              (Business Name, City, Phone, + the three lookup URLs). This is a
//              side sheet for you — NOT for kinda-crm import (it ignores extra columns).

import { readFileSync, writeFileSync } from 'node:fs'

const flags = {}
for (const a of process.argv.slice(2)) { const m = a.match(/^--([^=]+)(?:=(.*))?$/); if (m) flags[m[1]] = m[2] ?? true }

const OFFICIAL = 'https://businessregistration.utah.gov/'
function links(name, city) {
  const q = `"${name}" ${city || ''} Utah registered agent`.trim()
  return {
    google: 'https://www.google.com/search?q=' + encodeURIComponent(q),
    opencorporates: 'https://opencorporates.com/companies/us_ut?q=' + encodeURIComponent(name),
    official: OFFICIAL,
  }
}

// ---- single mode ----
if (typeof flags.name === 'string') {
  const l = links(flags.name, typeof flags.city === 'string' ? flags.city : '')
  console.log(`\nOwner lookup — ${flags.name}${flags.city ? ` (${flags.city})` : ''}\n`)
  console.log(`  Google (start here): ${l.google}`)
  console.log(`  OpenCorporates:      ${l.opencorporates}`)
  console.log(`  Official Utah portal: ${l.official}  (paste the name)`)
  process.exit(0)
}

// ---- batch mode ----
if (typeof flags.input !== 'string') {
  console.error('Usage:\n  --name="Business Name" [--city=Orem]\n  --input=FILE [--out=FILE]')
  process.exit(1)
}
function parseCsv(text) {
  const rows = []; let row = [], f = '', q = false
  for (let i = 0; i < text.length; i++) { const c = text[i]
    if (q) { if (c === '"') { if (text[i+1] === '"') { f+='"'; i++ } else q=false } else f+=c }
    else if (c === '"') q=true
    else if (c === ',') { row.push(f); f='' }
    else if (c === '\n' || c === '\r') { if (c==='\r'&&text[i+1]==='\n') i++; row.push(f); f=''; if(row.length>1||row[0]!=='')rows.push(row); row=[] }
    else f+=c }
  if (f!==''||row.length){row.push(f);rows.push(row)}
  const [h,...b]=rows; return b.map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]??''])))
}
const cell = (v) => { const s = v==null?'':String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s }

const out = typeof flags.out === 'string' ? flags.out : flags.input.replace(/\.csv$/i, '') + '.owner-lookups.csv'
const recs = parseCsv(readFileSync(flags.input, 'utf8'))
const header = ['Business Name', 'City', 'Phone', 'Google Lookup', 'OpenCorporates', 'Official Portal']
const lines = [header.map(cell).join(',')]
for (const r of recs) {
  // recover the city from the door2door tag (e.g. "door2door;Orem")
  const city = (r.Tags || '').split(';').map(s => s.trim()).find(s => s && s.toLowerCase() !== 'door2door') || ''
  const l = links(r['Business Name'], city)
  lines.push([r['Business Name'], city, r.Phone || '', l.google, l.opencorporates, l.official].map(cell).join(','))
}
writeFileSync(out, lines.join('\r\n') + '\r\n')
console.log(`Wrote ${recs.length} lookup rows → ${out}`)
