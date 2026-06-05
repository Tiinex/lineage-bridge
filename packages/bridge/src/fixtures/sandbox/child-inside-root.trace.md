# Continuity Context

- Envelope Schema: [tiinex.root.v1](https://github.com/Tiinex/docs/blob/0e6d169685d56c913cb890ba568a96b366ebd4bf/.topics/.schemas/tiinex.root.v1.schema.md)
- Parent
  - Parent Schema: [tiinex.topic.v1](https://github.com/Tiinex/docs/blob/main/.topics/.schemas/tiinex.topic.v1.schema.md)
  - Created At: 2026-06-06 00:00:00
  - Trace: [../outside-root-parent.trace.md](../outside-root-parent.trace.md)
  - Origin:
    - [relative](../outside-root-parent.trace.md)
- Current
  - Current Schema: [tiinex.task.v1](https://github.com/Tiinex/docs/blob/main/.topics/.schemas/tiinex.task.v1.schema.md)
  - Created At: 2026-06-06 00:05:00
  - Summary: Fixture child inside allowed sandbox root.

---

# Sandbox Child

## Objective

Exercise parent traversal blocking when the parent would resolve outside the allowed workspace root.

## Done Criteria

Lineage should stop before reading the parent outside the allowed root.

## Scope

Bounded sandbox fixture only.

---

# Continuity Integrity

- sha256-base64url-c14n-v1
  - Towards: [self](self)
  - Value: sandbox-child