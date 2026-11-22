# ioBroker.spiderfarmer

**Unofficial public beta.** Connects a Spider Farmer GGS PS5 power strip directly to its vendor cloud and exposes its five outlets and reported sensor readings in ioBroker. No Home Assistant, ESP32, proxy Wi-Fi or router/DNS change is required.

Tested with **SF-GGS-PS5, firmware 3.14**, including real outlet switching and state feedback. Other models and firmware are not yet supported. This project is not affiliated with Spider Farmer.

## Requirements

- Node.js 22 or later recommended (minimum 20), ioBroker js-controller 6+, Admin 7+.
- A working Spider Farmer account with email-code login.
- A GGS PS5 already online in the official app.
- Outbound HTTPS to `api.spider-farmer.com:443` and MQTT/TLS to `sf.mqtt.spider-farmer.com:8883`.

## Install the beta from GitHub

In ioBroker Admin, use the custom adapter URL installation (expert mode) and enter:

```text
https://github.com/Nesseya01/ioBroker.spiderfarmer
```

Or on the ioBroker host:

```sh
iobroker url https://github.com/Nesseya01/ioBroker.spiderfarmer
iobroker add spiderfarmer
```

This is a GitHub beta, **not an official ioBroker repository entry or an npm release**. Back up your ioBroker installation before installing third-party adapters.

## Sign in and select your device

1. Enable the instance and open its settings. With no session it waits for setup.
2. Enter your Spider Farmer account email and choose **Request email code**.
3. Enter the six-digit code and choose **Sign in**. Never put the code into a GitHub issue.
4. Refresh the device selector, choose your GGS PS5 and choose **Activate selected device**.
5. The adapter saves encrypted MQTT credentials and restarts. Check `info.connection` and `info.status`.

Do these steps in the same open settings dialog without saving/restarting halfway through. The temporary setup session expires after 15 minutes. If it expires, request a new code. There is no account password field.

The initial email login can sign your phone out of the official app once. You can log back into the app afterwards. Normal operation uses its own MQTT client ID and does not repeatedly log in. If the cloud rejects saved credentials, repeat setup.

## States

Within `spiderfarmer.0` (or your chosen instance):

| State | Meaning |
| --- | --- |
| `info.connection` | Connection to the cloud MQTT broker; does not alone prove the device is responding |
| `info.status` | Setup, connection and command status |
| `info.lastMessage` | Last device status response, epoch milliseconds |
| `outlets.1.state` … `outlets.5.state` | Actual reported outlet state, read-only |
| `outlets.1.set` … `outlets.5.set` | Explicit boolean command, write with `ack:false` |
| `outlets.1.mode` … `outlets.5.mode` | Reported operating mode |
| `sensors.*` | Temperature, humidity, VPD, PPFD, CO₂, soil temperature/moisture/EC and Wi-Fi RSSI, where reported |

**Switching selects manual mode for that outlet.** Existing schedule definitions are retained, but manual mode replaces active scheduled/cycle/environment control until you re-enable it in the app. The adapter reads and merges the current outlet configuration immediately before sending a switch command. It does not alter other outlets.

A command field being acknowledged means processing has finished, **not** that switching succeeded. Use the separate `.state` value and `info.status` to check. Offline, stale, invalid and already acknowledged commands are rejected; commands are not queued across restarts. No outlets are switched during startup or setup.

An optional `0_userdata.0` alias prefix is available for existing dashboards. Normally leave it empty. Native adapter states work without it. No site-specific names, device identifiers, local IP addresses or account credentials are bundled.

## Connection and security

- Uses encrypted ioBroker native fields for MQTT credentials. The adapter uses the ioBroker system key.
- The one-time code is only used during setup; no REST login token is retained by the running adapter.
- HTTPS uses normal system trust. MQTT verifies the broker certificate against the included vendor CA **and checks the server name**. Verification is never disabled. A vendor certificate change may require an update.
- Uses one MQTT connection, push updates and a read-only status query once a minute.
- Depends on the vendor cloud and an unofficial protocol. Cloud changes can break the integration.
- Only five-outlet SF-GGS-PS5 devices are selectable in this beta. Grow lights, fans, history import and other device types are not implemented.

## Development

```sh
npm ci
npm test
npm run check
```

Tests use synthetic data and stubbed adapter/MQTT objects; they never log in or switch a real device. CI runs on Node.js 22 and 24.

## Deutsch

Der Adapter bindet eine **Spider Farmer GGS PS5** über die Cloud direkt in ioBroker ein. Die fünf Steckplätze sind einzeln schaltbar; gemeldete Sensorwerte werden übernommen. Anmeldung unter den Instanzeinstellungen: E-Mail → Code anfordern → Code eingeben → anmelden → Geräteauswahl aktualisieren → Gerät aktivieren. Bis zur vollständigen Einrichtung die Einstellungen nicht zwischendurch speichern.

Beim Schalten wechselt der betreffende Steckplatz in den manuellen Modus. Die Rückmeldung steht getrennt vom Befehlsfeld. Keine automatische Schaltung bei Anmeldung oder Start. Router und DNS bleiben unverändert. Diese erste öffentliche Beta ist bislang mit einem PS5-Gerät praktisch getestet.

## Credits and license

MIT. Cloud protocol and AES framing adapted from [soma-web/hass-spider-farmer](https://github.com/soma-web/hass-spider-farmer). See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for attribution and certificate provenance.
