"""
AES-256-CBC encryption for platform cookies stored in PostgreSQL.
Compatible with Node.js crypto module implementation in server.js.

Key derived from COOKIE_ENCRYPTION_KEY env var via PBKDF2.
Format: base64(iv):base64(ciphertext)
"""

import os
import base64
import hashlib
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives import padding


SALT = b'rebase-ci-cookie-salt'
ITERATIONS = 100_000


def _derive_key():
    """Derive AES-256 key from env var using PBKDF2-SHA256."""
    key_material = os.environ.get('COOKIE_ENCRYPTION_KEY', 'dev-key-change-in-production')
    return hashlib.pbkdf2_hmac('sha256', key_material.encode(), SALT, ITERATIONS)


def encrypt_cookies(plaintext: str) -> str:
    """Encrypt a cookie string. Returns 'base64(iv):base64(ciphertext)'."""
    key = _derive_key()
    iv = os.urandom(16)

    # PKCS7 padding
    padder = padding.PKCS7(128).padder()
    padded = padder.update(plaintext.encode()) + padder.finalize()

    cipher = Cipher(algorithms.AES(key), modes.CBC(iv))
    encryptor = cipher.encryptor()
    ciphertext = encryptor.update(padded) + encryptor.finalize()

    return base64.b64encode(iv).decode() + ':' + base64.b64encode(ciphertext).decode()


def decrypt_cookies(stored: str) -> str:
    """Decrypt a cookie string from 'base64(iv):base64(ciphertext)' format."""
    key = _derive_key()

    parts = stored.split(':')
    if len(parts) != 2:
        raise ValueError("Invalid encrypted cookie format (expected iv:ciphertext)")

    iv = base64.b64decode(parts[0])
    ciphertext = base64.b64decode(parts[1])

    cipher = Cipher(algorithms.AES(key), modes.CBC(iv))
    decryptor = cipher.decryptor()
    padded = decryptor.update(ciphertext) + decryptor.finalize()

    # Remove PKCS7 padding
    unpadder = padding.PKCS7(128).unpadder()
    plaintext = unpadder.update(padded) + unpadder.finalize()

    return plaintext.decode()
