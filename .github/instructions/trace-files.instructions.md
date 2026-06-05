---
description: Agent-facing guidance for `.trace.md` access in lineage-bridge. Prefer bridge tools for normal orientation and lineage traversal; reserve raw reads for bounded debugging and authoring cases.
applyTo: "**/*.trace.md"
---

# Trace File Access Guidance

Use bridge tools as the normal path for orientation, lineage traversal, handoff, and bounded inspection.

Preferred normal path:

- `readEnvelope`
- `validateArtifact`
- `getLineage`
- `getRelevantSlice`
- `getHandoffPacket`
- `getNodeDetails`

Do not make raw `.trace.md` inspection the normal agent path when those bridge outputs are sufficient.

Legitimate raw-read exceptions:

- parser debugging
- checksum boundary debugging
- schema authoring
- validator repair
- exact markdown syntax inspection
- source adapter debugging

If a tool or API surface adds an explicit raw-read override in the future, require a short reason where practical.

This file is guidance, not enforcement.

It does not create a sandbox or permission boundary by itself.

Any future hard block on raw `.trace.md` access must live in tool policy, sandbox policy, or runtime permissions rather than instruction text alone.