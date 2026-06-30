# iGhost Safety Hardening Demo Notes

Use this artifact to show that iGhost can safely accept public website URLs without turning the server into a private-network fetcher.

## What changed

- Website URLs are normalized through a shared helper before browser capture, live ghost navigation, or HTML context fetches.
- URLs are limited to `http` and `https`, cannot include embedded credentials, and cannot point at localhost/private/link-local/reserved IP ranges.
- Hostnames are DNS-resolved before outbound access; every resolved address must be public to pass validation.
- API JSON bodies have a default 1 MB cap, JSON content-type validation, and clear 4xx errors for malformed/oversized bodies.
- API requests have a basic per-client rate limit (`IGHOST_RATE_LIMIT_MAX`, default 60, per `IGHOST_RATE_LIMIT_WINDOW_MS`, default 60 seconds).

## Demo checks

These are covered by `npm test` and do not require an OpenAI API key:

```bash
npm test
```

Expected blocked examples:

- `localhost`
- `http://127.0.0.1:8080`
- `http://10.0.0.5`
- `http://172.16.0.1`
- `http://192.168.1.1`
- `http://169.254.169.254/latest/meta-data/`
- `file:///etc/passwd`
- `https://user:pass@example.com/`
- Any hostname whose DNS answer includes a private or link-local address

Expected accepted example:

- `https://example.com/` when DNS resolves only to public addresses

## Manual smoke test

Start the app and POST a blocked URL. The response should be a 400 before browser capture or OpenAI work starts.

```bash
npm start
curl -i http://localhost:4173/api/tests \
  -H 'content-type: application/json' \
  -d '{"websiteUrl":"http://127.0.0.1:4173","intendedTask":"Try the page"}'
```

If an OpenAI key is not configured, the existing missing-key validation still returns first for `/api/tests`; the URL hardening remains active in the shared helpers, capture, live navigation, and context fetch paths.
