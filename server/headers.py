"""Security headers on every response (API, SSE, static UI, errors).

The built UI has no inline script and no eval; React style attributes need style-src 'unsafe-inline'
(styles only, never scripts). Fonts and assets are bundled, so everything is 'self'.
A pure ASGI middleware, not BaseHTTPMiddleware, so streaming (SSE) responses are not buffered.
"""
CSP = ("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; "
       "img-src 'self' data:; font-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")

HEADERS = {
    "content-security-policy": CSP,
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "strict-transport-security": "max-age=31536000",
    "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), interest-cohort=()",
    "cross-origin-opener-policy": "same-origin",
    "x-frame-options": "DENY",
}


def apply(response):
    """Set the headers on a Starlette response object (used for error handlers that run outside the middleware)."""
    for k, v in HEADERS.items():
        response.headers[k] = v
    return response


class SecurityHeaders:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_with_headers(message):
            if message["type"] == "http.response.start":
                have = {k.lower() for k, _ in message.get("headers", [])}
                extra = [(k.encode(), v.encode()) for k, v in HEADERS.items() if k.encode() not in have]
                message = {**message, "headers": [*message.get("headers", []), *extra]}
            await send(message)

        await self.app(scope, receive, send_with_headers)


MAX_BODY_BYTES = 16 * 1024  # the largest legitimate body is a 2,000-character chat message (a few KB even as JSON-escaped unicode)


class _TooLarge(Exception):
    pass


class BodyLimit:
    """413 for a request body over MAX_BODY_BYTES, by Content-Length or, for chunked bodies, by counting."""

    def __init__(self, app, limit=MAX_BODY_BYTES):
        self.app, self.limit = app, limit

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        for k, v in scope["headers"]:
            if k == b"content-length":
                try:
                    if int(v) > self.limit:
                        await self._reject(send)
                        return
                except ValueError:
                    await self._reject(send)
                    return
        seen = 0

        async def counting_receive():
            nonlocal seen
            msg = await receive()
            if msg["type"] == "http.request":
                seen += len(msg.get("body", b""))
                if seen > self.limit:
                    raise _TooLarge
            return msg

        started = False

        async def tracking_send(message):
            nonlocal started
            started = started or message["type"] == "http.response.start"
            await send(message)

        try:
            await self.app(scope, counting_receive, tracking_send)
        except _TooLarge:
            if not started:
                await self._reject(send)

    @staticmethod
    async def _reject(send):
        body = b'{"detail":"request body too large"}'
        await send({"type": "http.response.start", "status": 413,
                    "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())]})
        await send({"type": "http.response.body", "body": body})
