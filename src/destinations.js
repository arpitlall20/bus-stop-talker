// Decodes the compact destination table written by scripts/build-data.js.
// Translink trip ids start with a unique number, e.g. "39782608-BT 26_27-44640".
function decodeDestinations(data) {
  const map = new Map();
  let id = 0;
  for (const pair of data.trips.split(';')) {
    if (!pair) continue;
    const [delta, idx] = pair.split(',');
    id += parseInt(delta, 36);
    map.set(id, data.names[parseInt(idx, 36)]);
  }
  return (tripId) => (tripId ? map.get(parseInt(tripId, 10)) || null : null);
}

module.exports = { decodeDestinations };
