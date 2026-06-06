# Continuity Context

- Envelope Schema: [tiinex.root.v1](https://github.com/Tiinex/docs/blob/0e6d169685d56c913cb890ba568a96b366ebd4bf/.topics/.schemas/tiinex.root.v1.schema.md)
- Parent
  - Parent Schema: [tiinex.topic.v1](https://github.com/Tiinex/docs/blob/main/.topics/.schemas/tiinex.topic.v1.schema.md)
  - Created At: 2026-06-06 00:10:00
  - Origin:
    - [relative](../outside-root-parent.trace.md)
- Current
  - Current Schema: [tiinex.task.v1](https://github.com/Tiinex/docs/blob/main/.topics/.schemas/tiinex.task.v1.schema.md)
  - Created At: 2026-06-06 00:15:00
  - Summary: Fixture that exposes only origin recovery candidates.

---

# Origin Recovery Only

## Objective

Expose origin recovery candidates without allowing them to silently drive local parent reads.

## Done Criteria

Lineage should stop at the current artifact and report recovery candidates only.

## Scope

Bounded sandbox fixture only.

---

# Continuity Integrity

- sha256-base64url-c14n-v1
  - Towards: [self](self)
  - Value: sandbox-origin-recovery-only