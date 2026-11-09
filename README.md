# Bus Stop Talker

A phone app for blind and low-vision riders in South East Queensland. Press one big button and it finds
your nearest Translink bus stop by GPS and reads out the next three buses, with route, destination and
how many minutes away, from Translink's free live data (no API key).

This is step 1 of the plan. The "almost here" alert (step 2) and the ESP32 button (step 3) come next.

## Try it on your phone

1. Install Node.js 20 or newer on your computer, and the **Expo Go** app on your phone.
2. In this folder run `npm install`, then `npx expo start`.
3. Scan the QR code with your phone (Camera app on iPhone, Expo Go on Android) and allow location.

## How it works

- **Big "Next buses" button**: gets your location, picks the nearest stop, downloads the live feed and
  reads it out. With VoiceOver or TalkBack on, the screen reader speaks it in your own voice settings;
  otherwise the phone's text-to-speech does. The phone gives a short vibration when it's ready.
- **Other stop**: steps through the 3 closest stops, which helps when the nearest one is across the road.
- **Repeat**: reads the last message again.

## Files

- `App.js` is the screen.
- `src/core.js` finds the nearest stops, picks the next buses and builds the sentence. It is plain
  JavaScript with no phone code, so it is tested with Node.
- `src/feed.js` downloads and decodes the live feed.
- `src/data/` holds the stop list, route numbers and trip destinations, built from Translink's timetable.

## Commands

- `npm test` runs the logic tests.
- `npm run try-live -- -27.4683 153.0240` prints what the app would say at that spot, using live data.
- `npm run build-data -- <folder>` rebuilds `src/data/` from Translink's timetable. Download
  https://gtfsrt.api.translink.com.au/GTFS/SEQ_GTFS.zip, unzip it, and pass the folder. Do this when
  Translink publishes a new timetable, otherwise destinations stop being read out for new trips (the
  route number and times still work).

## Known limits

- The live feed covers roughly the next hour, so a stop with no bus soon says none are showing.
- Each press downloads about 2 MB of live data for the whole region.
- A bus that ends its trip at your stop can still be listed.
