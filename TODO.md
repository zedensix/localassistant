# TODO

The only backlog. Each entry is a `- [ ]` checkbox: put `**[WIP]**` after the
box while it's being worked on, and delete the entry once it's done.

## Small

- [ ] The weather history only reaches three months back (Open-Meteo's
      `past_days`): backfill the rest of the Linky's year from the archive API
      so a winter can be compared with the last one.

## Medium

- [ ] The native app's assistant still posts stateless turns to
      `/api/v1/assistant`: give it the stored conversations, their search and
      the thinking, like the web chat.

- [ ] Python plugins only get the standard library in the image: support a
      `requirements` list in the manifest, installed into the plugin's folder.
- [ ] A plugin can only show its devices on the built-in cards: a generic
      "sensor" card driven by manifest-declared readings would cover kinds that
      fit no existing card.

## Large

- [ ] Mobile app parity: rooms and floors, energy charts, the logbook and
      dashboards, each with the `/api/v1` endpoints they need.
- [ ] Mobile app parity: routine editing, connecting the MQTT broker and the
      admin area, or a hand-off to the web page for each.
- [ ] Mobile app: report presence in the background (WorkManager with background
      location on Android, significant-change monitoring on iOS); today it only
      reports while open.
- [ ] Mobile app: signed release builds attached to each release, like
      Penombre's `mobile.yaml`, and store listings.
- [ ] Mobile app: instant notifications on iPhone; they're checked in the
      background today, since APNs needs a relay holding the app's Apple key.
