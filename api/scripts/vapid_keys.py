"""Print a new VAPID key pair for browser push (put both in api/.env; keep the private key secret).
Usage: python -m scripts.vapid_keys"""
import base64

from cryptography.hazmat.primitives import serialization
from py_vapid import Vapid02


def b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


if __name__ == "__main__":
    vapid = Vapid02()
    vapid.generate_keys()
    public = vapid.public_key.public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    private = vapid.private_key.private_numbers().private_value.to_bytes(32, "big")
    print(f"VAPID_PUBLIC_KEY={b64(public)}")
    print(f"VAPID_PRIVATE_KEY={b64(private)}")
