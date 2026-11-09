#!/usr/bin/env node
// Builds the small data files the app ships with, from Translink's static GTFS feed.
// Usage: node scripts/build-data.js <path-to-unzipped-SEQ_GTFS-folder>
// Get the feed from https://gtfsrt.api.translink.com.au/GTFS/SEQ_GTFS.zip and unzip it first.
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const dir = process.argv[2];
if (!dir) {
  console.error('Usage: node scripts/build-data.js <unzipped GTFS folder>');
  process.exit(1);
}
const outDir = path.join(__dirname, '..', 'src', 'data');

function parseLine(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

async function eachRow(file, fn) {
  const rl = readline.createInterface({ input: fs.createReadStream(path.join(dir, file)), crlfDelay: Infinity });
  let header = null;
  for await (const raw of rl) {
    const line = raw.replace(/^﻿/, '');
    if (!line) continue;
    const cells = parseLine(line);
    if (!header) { header = cells; continue; }
    const row = {};
    header.forEach((h, i) => { row[h] = cells[i]; });
    fn(row);
  }
}

(async () => {
  // Bus routes only (route_type 3 = bus).
  const routes = {};
  await eachRow('routes.txt', (r) => { if (r.route_type === '3') routes[r.route_id] = r.route_short_name; });

  const trips = new Set();
  const tripHeadsign = new Map(); // numeric trip id prefix -> headsign
  await eachRow('trips.txt', (t) => {
    if (routes[t.route_id] === undefined) return;
    trips.add(t.trip_id);
    const n = parseInt(t.trip_id, 10);
    if (Number.isFinite(n) && t.trip_headsign) tripHeadsign.set(n, t.trip_headsign);
  });

  const busStops = new Set();
  await eachRow('stop_times.txt', (s) => { if (trips.has(s.trip_id)) busStops.add(s.stop_id); });

  // Destination lookup, compact: a list of destination names, and a string of
  // "delta,index;" pairs (base 36) over the sorted numeric trip ids. See src/destinations.js.
  const names = [];
  const nameIdx = new Map();
  const ids = [...tripHeadsign.keys()].sort((a, b) => a - b);
  let prev = 0;
  const pairs = [];
  for (const id of ids) {
    const h = tripHeadsign.get(id);
    if (!nameIdx.has(h)) { nameIdx.set(h, names.length); names.push(h); }
    pairs.push(`${(id - prev).toString(36)},${nameIdx.get(h).toString(36)}`);
    prev = id;
  }
  const headsigns = { names, trips: pairs.join(';') };

  // Stops as compact rows: [id, name, lat, lon].
  const stops = [];
  await eachRow('stops.txt', (s) => {
    if (!busStops.has(s.stop_id)) return;
    if (s.location_type && s.location_type !== '0') return;
    stops.push([s.stop_id, s.stop_name, Number(Number(s.stop_lat).toFixed(6)), Number(Number(s.stop_lon).toFixed(6))]);
  });

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'stops.json'), JSON.stringify(stops));
  fs.writeFileSync(path.join(outDir, 'routes.json'), JSON.stringify(routes));
  fs.writeFileSync(path.join(outDir, 'destinations.json'), JSON.stringify(headsigns));
  console.log(`stops ${stops.length}, routes ${Object.keys(routes).length}, trips with destinations ${ids.length}`);
})();
