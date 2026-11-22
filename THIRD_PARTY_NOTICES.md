# Third-party notices

The cloud API paths, request framing, authentication flow, GGS device data model and configuration-merge approach are based on:

- soma-web/hass-spider-farmer, commit 578676dcb37e0bd230b7fee950d927dfb0f7c376
- https://github.com/soma-web/hass-spider-farmer
- Copyright (c) 2026 soma-web, MIT License. The complete MIT permission and warranty notice is included in LICENSE.

`lib/cloud-api.js` is a JavaScript adaptation of that project's `sfcloud/crypto.py` and `sfcloud/rest.py`. Static AES key and IV values are vendor application protocol constants, not user secrets.

`lib/vendor-ca.crt` is the public Spider Farmer cloud CA certificate, obtained from the publicly available certificate material in https://github.com/iceboerg00/spiderfarmer-bridge (commit 8675ac0898a2b567d154ff125d61ddb89753beab). It is used only as TLS trust material; no private key or client certificate is distributed. No Python proxy code from that repository is included. The project's MIT license applies to adapter code and does not claim ownership of vendor trust material or trademarks.

Runtime dependencies retain their respective upstream licenses and are installed through npm. Spider Farmer and ioBroker names identify compatibility; no endorsement is implied.
