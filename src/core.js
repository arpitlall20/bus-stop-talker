// Pure logic for finding the nearest stop and the next buses. No React Native imports,
// so it can be tested with plain Node.

const EARTH_RADIUS_M = 6371000;

// GTFS-realtime enums (numbers, as decoded by protobufjs).
const TRIP_CANCELED = 3;
const STOP_SKIPPED = 1;

function toNum(x) {
  if (x == null) return null;
  if (typeof x === 'object' && typeof x.toNumber === 'function') return x.toNumber();
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function distanceMetres(lat1, lon1, lat2, lon2) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

// stops: array of [id, name, lat, lon]. Returns the n closest, nearest first.
function nearestStops(stops, lat, lon, n = 3) {
  const best = [];
  for (const [id, name, sLat, sLon] of stops) {
    // Cheap box filter (~5 km) before the exact distance.
    if (Math.abs(sLat - lat) > 0.05 || Math.abs(sLon - lon) > 0.05) continue;
    const distance = distanceMetres(lat, lon, sLat, sLon);
    if (best.length < n || distance < best[best.length - 1].distance) {
      best.push({ id, name, lat: sLat, lon: sLon, distance });
      best.sort((a, b) => a.distance - b.distance);
      if (best.length > n) best.pop();
    }
  }
  return best;
}

// feed: a decoded GTFS-realtime FeedMessage (TripUpdates).
// Returns the next `limit` buses due at stopId, soonest first.
// destinationOf: tripId -> destination name or null.
function nextBuses(feed, stopId, nowSec, { routes = {}, destinationOf = () => null, limit = 3, graceSec = 15 } = {}) {
  const found = [];
  for (const entity of feed.entity || []) {
    const tu = entity.tripUpdate;
    if (!tu || !tu.trip) continue;
    if (tu.trip.scheduleRelationship === TRIP_CANCELED) continue;
    const updates = tu.stopTimeUpdate || [];
    const here = updates.find((u) => u.stopId === stopId);
    if (!here || here.scheduleRelationship === STOP_SKIPPED) continue;
    const time = toNum(here.arrival && here.arrival.time) || toNum(here.departure && here.departure.time);
    if (!time) continue;
    const secondsAway = time - nowSec;
    if (secondsAway < -graceSec) continue;

    const routeId = tu.trip.routeId || '';
    found.push({
      tripId: tu.trip.tripId,
      routeId,
      route: routes[routeId] || routeId.split('-')[0] || 'unknown',
      destination: destinationOf(tu.trip.tripId),
      arrivalTime: time,
      secondsAway,
      delaySec: toNum(here.arrival && here.arrival.delay),
    });
  }
  found.sort((a, b) => a.arrivalTime - b.arrivalTime);
  return found.slice(0, limit);
}

function describeWait(secondsAway) {
  if (secondsAway < 60) return 'due now';
  const mins = Math.round(secondsAway / 60);
  return mins === 1 ? 'in 1 minute' : `in ${mins} minutes`;
}

function describeDistance(m) {
  if (m < 15) return 'right here';
  if (m < 1000) return `${Math.round(m / 5) * 5} metres away`;
  return `${(m / 1000).toFixed(1)} kilometres away`;
}

// Builds the sentence that is read out.
function describeArrivals(stop, buses, { accuracyM = null } = {}) {
  const parts = [`${stop.name}, ${describeDistance(stop.distance)}.`];
  if (accuracyM != null && accuracyM > 30) {
    parts.push(`Your location is only accurate to about ${Math.round(accuracyM)} metres.`);
  }
  if (buses.length === 0) {
    parts.push('No live buses are showing for this stop in the next hour or so.');
  } else {
    for (const b of buses) {
      const to = b.destination ? ` to ${b.destination}` : '';
      parts.push(`Route ${b.route}${to}, ${describeWait(b.secondsAway)}.`);
    }
  }
  return parts.join(' ');
}

module.exports = { toNum, distanceMetres, nearestStops, nextBuses, describeWait, describeDistance, describeArrivals };
