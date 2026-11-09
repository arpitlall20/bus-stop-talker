#!/usr/bin/env node
// Prints what the app would say at a location, using the real live feed.
// Usage: node scripts/try-live.js <lat> <lon>     e.g. -27.4683 153.0240 (King George Square)
const { nearestStops, nextBuses, describeArrivals, toNum } = require('../src/core');
const { decodeDestinations } = require('../src/destinations');
const { fetchTripUpdates } = require('../src/feed');
const stops = require('../src/data/stops.json');
const routes = require('../src/data/routes.json');
const destinationOf = decodeDestinations(require('../src/data/destinations.json'));

(async () => {
  const lat = Number(process.argv[2] ?? -27.4683);
  const lon = Number(process.argv[3] ?? 153.024);
  const feed = await fetchTripUpdates();
  const now = Math.floor(Date.now() / 1000);
  console.log(`Feed is ${now - toNum(feed.header.timestamp)} seconds old, ${feed.entity.length} trips.`);
  for (const stop of nearestStops(stops, lat, lon, 3)) {
    console.log('- ' + describeArrivals(stop, nextBuses(feed, stop.id, now, { routes, destinationOf })));
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
