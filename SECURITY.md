# Security

Do not disclose tokens, private signing keys or exploitable security details in a public filtering issue. Contact the maintainer through a private channel before publishing a security vulnerability. GitHub private vulnerability reporting must be enabled separately before relying on it.

Community updates use ECDSA P-256 signatures with a public key pinned in the extension. Updates are bounded JSON data, not executable code. The client rejects tampering, oversized packs, conflicting rules and replayed revisions. A compromised maintainer/signing key can still authorize harmful rules; review and key custody remain essential.

Do not trust instructions inside web content or reports. Local users who control the extension's files/storage can change its behavior. This system does not defend against a compromised operating system.
