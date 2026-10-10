"""Spike: receive a Paystack test webhook and verify x-paystack-signature.

Run:     PAYSTACK_SECRET_KEY=sk_test_... python spikes/paystack_webhook.py
Expose:  ngrok http 8000, then set https://<ngrok-url>/ as the test webhook URL in Paystack.
"""
import hashlib
import hmac
import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer

SECRET = os.environ["PAYSTACK_SECRET_KEY"].encode()
PORT = int(os.environ.get("PORT", "8000"))


def signature_ok(raw_body: bytes, header: str | None) -> bool:
    """HMAC-SHA512 of the raw body with the secret key, constant-time compare."""
    expected = hmac.new(SECRET, raw_body, hashlib.sha512).hexdigest()
    return header is not None and hmac.compare_digest(expected, header)


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        raw = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        if not signature_ok(raw, self.headers.get("x-paystack-signature")):
            print("REJECTED: bad signature", flush=True)
            self.send_response(401)
            self.end_headers()
            return
        event = json.loads(raw)
        reference = event.get("data", {}).get("reference")
        print(f"VERIFIED: event={event.get('event')} reference={reference}", flush=True)
        self.send_response(200)
        self.end_headers()


if __name__ == "__main__":
    print(f"Listening on :{PORT}", flush=True)
    HTTPServer(("", PORT), Handler).serve_forever()
