# iGhost security validation

Run `npm test` without service credentials. Tests substitute synthetic credentials and mock issue delivery; they do not spend OpenAI credits or create real issues.

The regression suite checks:

- IPv4/IPv6 classification, including mapped loopback in hexadecimal form, the full link-local range, mixed public/private DNS answers and special-use addresses.
- HTTP proxy connections pinned to a validated IP. A hostname that later resolves privately is rejected before a socket opens.
- Private redirect destinations, subresource URLs, CONNECT targets and WebSocket upgrades are denied.
- Owner authentication for private APIs/assets, session expiry/tampering and cross-origin mutation rejection.
- Shared reports are redacted and authorize only their own video. New reports stay private.
- Only the configured repository can receive an issue. Simultaneous and repeated sends make one mocked GitHub call.
- Concurrent generation preserves other tests and follow-ups; migration retains links and the original JSON backup.

Set `IGHOST_TEST_BROWSER` to an installed Chromium executable to include the real browser policy check. It uses a temporary profile and only synthetic localhost servers. A public fixture works through a pinned-address proxy, while loopback subresources/redirects cause zero requests to the private fixture. Its proxy denies all other hostnames and its browser process group is stopped afterward.

`/health` is intentionally public. Private APIs require an owner session or bearer token: unauthenticated calls return 401 before model work or issue creation. Startup requires a random `IGHOST_ACCESS_TOKEN` of at least 24 characters. Keep it in server environment configuration, not source control.

This policy protects browser destination selection; it is not an operating-system sandbox against browser vulnerabilities. Use current Chromium and isolate deployment from sensitive services. The record store supports one server process per data directory.
