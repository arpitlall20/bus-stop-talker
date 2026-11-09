// Fetches and decodes Translink's live bus arrivals (GTFS-realtime, free, no key needed).
const { transit_realtime: rt } = require('gtfs-realtime-bindings');

const TRIP_UPDATES_URL = 'https://gtfsrt.api.translink.com.au/api/realtime/SEQ/TripUpdates/Bus';

async function fetchTripUpdates(url = TRIP_UPDATES_URL) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Translink live feed answered ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  return rt.FeedMessage.decode(bytes);
}

module.exports = { TRIP_UPDATES_URL, fetchTripUpdates };
