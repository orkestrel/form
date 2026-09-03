# Guides

A dual-axis index into this repository's guides — by concept, and by directory.

## By concept

| Concept | Spec                 | Source                    | Tests                                 |
| ------- | -------------------- | ------------------------- | ------------------------------------- |
| Form    | [`form.md`](form.md) | [`src/core`](../src/core) | [`tests/src/core`](../tests/src/core) |

## By directory

| Directory  | Guide                |
| ---------- | -------------------- |
| `src/core` | [`form.md`](form.md) |

The parity suite transcribes and executes the flagship fence set from `form.md`. It name-checks and
parity-checks the remaining fences but does not run them.

## Dependency reference

Each row names a byte-identical mirror of the guide for a declared dependency, documenting **that
package's** surface rather than anything sourced here. Each is kept beside this guide set so a
reader can see the primitives this workspace is built from without leaving it.

| Mirror                       | Package               | Dependency  | What that package supplies here                                                       |
| ---------------------------- | --------------------- | ----------- | ------------------------------------------------------------------------------------- |
| [`contract.md`](contract.md) | `@orkestrel/contract` | runtime     | The outcome, guard, and JSON primitives `src/core` imports.                           |
| [`emitter.md`](emitter.md)   | `@orkestrel/emitter`  | runtime     | The typed emitter a `Form` owns.                                                      |
| [`guide.md`](guide.md)       | `@orkestrel/guide`    | development | The parity primitives [`tests/guides.test.ts`](../tests/guides.test.ts) runs on.      |
| [`probe.md`](probe.md)       | `@orkestrel/probe`    | development | The `prove` instrument an agent arms against the `probe` Vitest project.              |
| [`scaffold.md`](scaffold.md) | `@orkestrel/scaffold` | development | The generator that writes and repairs the vendored configuration, tests, and tooling. |
| [`test.md`](test.md)         | `@orkestrel/test`     | development | The shared recorder, delay, and fixture helpers the suites import.                    |

A mirror's own relative links address its upstream tree, so they resolve to nothing here and sit
outside this repository's link parity. Refresh a mirror from upstream rather than rewriting it.

## See also

- [`AGENTS.md`](../AGENTS.md) — the coding contract every guide is written against.
