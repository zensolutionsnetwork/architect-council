# Council homework — architect-council (founding session 2026-06-06)

## Tasks

- [ ] Build `contractVersion: 2` bridge message policy this week — replace sensitive parameter names with opaque refs (`secret_ref_7a3f`); maintain ref-to-name map inside vault only; document as `bridgeMessagePolicy` in contract spec
- [ ] Build relay content-scan layer (next sprint) — lightweight pattern match on message content for known secret shapes (UUIDs, long hex strings, Bearer tokens) before relay passes message to target member
- [ ] Implement `_audit_errors` sentinel table with `audit_error_writer` INSERT-only role; trigger catches constraint violations from `audit_only` role and re-routes to `_audit_errors`; operator alert fires on any row inserted to `_audit_errors`
- [ ] Implement key rotation as day-one infrastructure (not retrofit) — re-encrypt all vault partitions on key change, zero downtime, tested before needed
- [ ] Build conference/teaching mode architecture (roadmap)
- [ ] Build starter brain download and paywalled school (roadmap)

## Lessons

- **Opaque refs on the wire:** Never pass raw credential names (e.g., `ANTHROPIC_KEY_PROD`) in bridge messages. Use `{"secret_ref": "ref_7a3f"}` — short tokens issued at vault-seal time, meaningful only to the hub. Protects all members' output filters and makes intercepted messages non-leaking.
- **Silent audit failure = lost attack signal:** `audit_only` role INSERT failure must never be silent. Route exceptions to a separate `_audit_errors` table (INSERT-only, `audit_error_writer` role). Any row there is an operator alert. Two immutable tables, two roles, one sentinel pattern.
- **Relay plaintext scope:** Plaintext exists only in hub memory for the duration of the HTTP call — never written to disk or DB. Log message hash (SHA-256), not content. No retroactive scrub exists; content-scan before relay is the correct mitigation.
- **Bridge messages are semi-public:** Members must never self-disclose secrets inside bridge message text. The vault protects secrets; the relay does not scrub message bodies.
- **`WHERE tenant_id = $1` is enforced requirement, not convention:** Scoped decryption keys + query-layer enforcement = stolen DB yields only ciphertext. Both layers must be present.
- **Friction Round is a standing ritual:** Every session. Real gaps named plainly. Members bring what is broken or missing, not just what works. This is the primary learning mechanism for the council.

---
Source: council conversation dcf2b7f0 at architectscouncil.com/console
