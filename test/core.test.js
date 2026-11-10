const test = require('node:test');
const assert = require('node:assert');
const { nearestStops, nextBuses, describeArrivals, describeWait, distanceMetres } = require('../src/core');
const { decodeDestinations } = require('../src/destinations');

const stops = [
  ['A', 'Ann Street Stop 11', -27.468003, 153.02397],
  ['B', 'King George Square, 2c', -27.4683, 153.0241],
  ['C', 'Far Away Stop', -27.6, 153.2],
];

test('distance is about right', () => {
  const d = distanceMetres(-27.468003, 153.02397, -27.4683, 153.0241);
  assert.ok(d > 30 && d < 40, `got ${d}`);
});

test('nearest stops are sorted and far stops are ignored', () => {
  const r = nearestStops(stops, -27.4683, 153.0241, 3);
  assert.deepStrictEqual(r.map((s) => s.id), ['B', 'A']);
  assert.ok(r[0].distance < 1);
});

const now = 1000000;
const tu = (tripId, routeId, updates, rel = 0) => ({ tripUpdate: { trip: { tripId, routeId, scheduleRelationship: rel }, stopTimeUpdate: updates } });
const at = (stopId, t, rel = 0) => ({ stopId, arrival: { time: t, delay: 0 }, scheduleRelationship: rel });

test('next buses: soonest first, limited, skips cancelled, skipped and departed', () => {
  const feed = {
    entity: [
      tu('5-x', '61-4', [at('B', now + 600)]),
      tu('1-x', '199-4', [at('B', now + 120), at('Z', now + 300)]),
      tu('2-x', '60-4', [at('B', now + 30)], 3), // cancelled trip
      tu('3-x', '66-4', [at('B', now + 60, 1)]), // stop skipped
      tu('4-x', '222-4', [at('B', now - 120)]), // already gone
      tu('6-x', '444-4', [at('B', now + 300)]),
      tu('7-x', '29-4', [at('B', now + 900)]),
      tu('8-x', '29-4', [at('A', now + 10)]), // other stop
    ],
  };
  const dest = (id) => ({ '1-x': 'Teneriffe' }[id] || null);
  const r = nextBuses(feed, 'B', now, { routes: { '199-4': '199' }, destinationOf: dest });
  assert.deepStrictEqual(r.map((b) => b.route), ['199', '444', '61']);
  assert.strictEqual(r[0].destination, 'Teneriffe');
  assert.strictEqual(r[1].destination, null);
});

test('departure time is used when arrival is missing', () => {
  const feed = { entity: [tu('1-x', '199-4', [{ stopId: 'B', departure: { time: now + 240 } }])] };
  assert.strictEqual(nextBuses(feed, 'B', now)[0].secondsAway, 240);
});

test('wait wording', () => {
  assert.strictEqual(describeWait(20), 'due now');
  assert.strictEqual(describeWait(70), 'in 1 minute');
  assert.strictEqual(describeWait(400), 'in 7 minutes');
});

test('spoken sentence', () => {
  const stop = { name: 'King George Square, 2c', distance: 22 };
  const s = describeArrivals(stop, [{ route: '199', destination: 'Teneriffe', secondsAway: 200 }, { route: '61', destination: null, secondsAway: 10 }], { accuracyM: 50 });
  assert.strictEqual(s, 'King George Square, 2c, 20 metres away. Your location is only accurate to about 50 metres. Route 199 to Teneriffe, in 3 minutes. Route 61, due now. No more buses are showing in the next hour or so.');
  assert.match(describeArrivals(stop, []), /No live buses/);
});

test('one bus says there are no others, three buses says nothing extra', () => {
  const stop = { name: 'Stop', distance: 5 };
  const bus = { route: '61', destination: null, secondsAway: 300 };
  assert.match(describeArrivals(stop, [bus]), /Route 61, in 5 minutes\. No other buses are showing in the next hour or so\.$/);
  assert.doesNotMatch(describeArrivals(stop, [bus, bus, bus]), /No (other|more) buses/);
});

test('destination table round-trips', () => {
  const data = { names: ['City', 'Garden City interchange'], trips: ['10,0', '2,1', 'z,0'].join(';') };
  const of = decodeDestinations(data);
  assert.strictEqual(of('10-BT 26'), null); // id 36
  assert.strictEqual(of('36-BT'), 'City');
  assert.strictEqual(of('38-BT'), 'Garden City interchange');
  assert.strictEqual(of('73-BT'), 'City');
  assert.strictEqual(of(undefined), null);
});
