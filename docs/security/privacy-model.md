# Privacy Model

- Backend stores room code, transfer session identifiers, connection identifiers, status, and expiry timestamps.
- Backend does not store file bytes, plaintext metadata, or raw file encryption keys.
- File encryption occurs in sender browser before transfer.
- File decryption occurs in receiver browser after encrypted chunk receipt.
