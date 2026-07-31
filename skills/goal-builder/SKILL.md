---
name: goal-builder
description: Interview a rough objective into a checkable goal, then set it up to run as an agentic loop. Use when the user wants to start a goal / autonomous loop / long-running task, or says "set a goal", "make this a goal", "keep working until", "run until done", "/goal", "ultragoal". Brainstorms the goal through clarifying questions first, then composes a verifiable completion condition (measurable end state + stated check + constraints + turn cap) and offers to launch it — /goal in Claude Code, goal/ultragoal in Codex. Supersedes goal-prompt-writer.
---

# Goal Builder

Turn a rough objective into a **checkable goal an agent can loop on safely**, then
set it up to run. Two phases: **interview** (brainstorm the goal into something
verifiable) → **compose + set up** (write the goal, offer to launch it).

Tool-aware: works under **Claude Code** (`/goal` builtin) and **Codex** (goal mode /
`ultragoal`). Detect which you are and use that tool's launch path.

## Why this exists (the loop-engineering grounding)

A goal drives an **agentic loop**: the agent works a turn, an evaluator checks whether
the goal is met, and if not it keeps going. This only works if the goal is written as
something **checkable from the agent's own output**. Frontier-lab practice (Anthropic
`/goal`, OpenAI Agents SDK run loop, Geoffrey Huntley's Ralph) converges on the same
rules — bake them into every goal you build:

- **The evaluator sees only the transcript.** Claude Code's `/goal` sends the condition
  + conversation so far to a small fast model (default Haiku) after each turn; it
  **does not run commands or read files**. So the condition must be demonstrable in what
  the agent already surfaced. "All tests in `test/auth` pass" works *because the agent
  runs the tests and the result lands in the transcript*. "The code is well-architected"
  does not — nothing in the transcript proves it.
- **A durable condition has three parts:** ① one measurable end state (test result,
  build exit code, file count, empty queue) ② a stated check (how to prove it — `npm test`
  exits 0, `git status` clean) ③ constraints that must not change on the way there.
- **Always bound the loop.** Add a turn/time clause (`or stop after 20 turns`) so an
  impossible task can't loop forever. The clause is evaluator-judged from the conversation
  (soft), not a hard kill — the hard stops are `/goal clear` / `/clear` / Ctrl+C and the
  token budget. Keep the cap modest. Condition ≤ 4000 chars.
- **Cross-session durability = the Ralph git layer.** For work too big for one session
  (context resets between iterations), state lives on disk + git, not in the conversation:
  stable prompt file, frozen `specs/`, a `fix_plan.md` task queue, and **commit-per-iteration**
  (the commit message is the journal, git history is memory, `git reset --hard` is rollback).
  Recommend this layout when the goal spans many files / many turns.

## Phase 1 — Interview (brainstorm the goal)

Unlike a one-shot prompt writer, **ask until the goal is checkable** — but stay bounded
(don't interrogate; 2–4 sharp questions usually suffice). In Claude Code use
`AskUserQuestion`; in Codex ask inline. Skip any answer the user already gave or that's
obvious from context, and state assumptions instead of asking when a sensible default
exists.

Probe the gaps that would otherwise make the goal un-checkable or unsafe:

1. **End state** — "When this is done, what is observably different?" Force one concrete
   sentence. Reject "make it better".
2. **The check** — "How would *you* prove it's done?" A command, a file, a screen, an
   empty queue. If they can't name one, the goal isn't ready — help derive it.
3. **Scope** — what files/modules may change; what is read-only.
4. **Forbidden** — what must NOT change (contracts, other tests, deps, prod, secrets).
5. **Bound** — acceptable turn/time budget before it should stop and report.
6. **Durability** (only if big) — one session or many? If many, propose the Ralph file
   layout + commit-per-iteration.

Stop interviewing once you can state a measurable end state + a check + a stop condition.

## Phase 2 — Compose the goal

Fill this block. Keep it tight; every line must help the agent decide "done / not done".

```text
목표:
<작업이 끝났을 때 무엇이 달라지는지 한 문장. 관찰 가능하게.>

완료 기준:
- <transcript로 증명 가능한 결과 — 에이전트가 직접 돌려 출력이 대화에 남는 것>
- <확인 수단: `<command>` exits 0 / `<file>` 존재·개수 / 화면·산출물>
- <회귀·부작용 없음 기준>

범위:
- 수정 가능: <파일/디렉토리/모듈>
- 읽기 참고: <스펙/문서/로그>
- 산출물: <만들/갱신할 파일·보고서>

금지 사항:
- <건드리면 안 되는 파일/기능/계약>
- <추가 금지 의존성/권한/운영 변경>
- <민감정보·실데이터·임시 우회 금지>

반복 방식:
1. 현재 상태·관련 파일 먼저 확인.
2. 최소 변경으로 구현.
3. 완료 기준을 직접 검증(명령 실행 → 결과를 출력에 남긴다).
4. 실패하면 원인 기록 후 수정·재검증.
5. 같은 실패 N회 반복이면 접근 변경, 그래도 막히면 blocker 보고.

검증:
- 실행 명령: `<command>`
- 확인 파일/화면: `<path or surface>`
- 주관적 기준은 독립 검수자/체크리스트로.

멈춤 조건:
- 완료 기준 전부 충족 + 검증 증거 있으면 종료.
- 또는 <N>턴/<T>분 경과하면 진행상황 보고 후 멈춤.   ← 무한루프 방지(필수)
- 비밀키·결제·프로덕션·파괴적 git 작업 필요하면 멈춤.

최종 보고:
- 변경 파일 / 검증 명령·결과 / 충족 기준 / 남은 리스크·미검증.
```

For multi-module / many-turn work, also fill: `작업 분해`, `각 단계 승인 기준`,
`병렬화 기준`(독립 파일만 병렬·단일 writer는 직렬), `독립 검수`, `상태/증거 기록`.
And recommend the durable layout: stable `PROMPT.md`, frozen `specs/*.md`,
`fix_plan.md` queue, commit + tag per green iteration.

## Phase 3 — Set up + offer to launch

Compose done → **set it up and offer to run it. Do not auto-run; confirm first.**

**If Claude Code:** distill the block into a one-line `/goal` condition — a measurable
end state + the check + a turn cap — and offer to run it:

```text
/goal all tests in test/auth pass (npm test exits 0) and git status is clean, do not modify other test files, or stop after 20 turns
```

Tell the user: turn on Auto mode so each turn runs unattended; `/goal` (no arg) shows
turns/tokens spent; `/goal clear` (or `/clear` / Ctrl+C) is the hard stop — the turn cap
itself is soft. Remind that the evaluator only reads the transcript, so the agent must
actually run the check each turn.

**If Codex:** hand off to goal mode (`create_goal` payload) for a single bounded task,
or to **`ultragoal`** for durable multi-goal plans (it writes `.omx/ultragoal/` artifacts
and drives Codex `/goal`). Give the full block as the goal text; for ultragoal, split the
`작업 분해` into stories.

**Durable / cross-session (either tool):** scaffold the Ralph layout — write `PROMPT.md`
(the stable loop prompt = this goal block), `specs/` (frozen requirements), `fix_plan.md`
(priority task queue), and instruct: each iteration reads `fix_plan.md`, does the top
item, verifies, commits with a descriptive message, updates `fix_plan.md`. Completion =
queue empty or stop clause hit.

## Checklist (before handing the goal over)

- [ ] Result is clear enough to say "done / not done".
- [ ] At least one completion criterion is provable **from the agent's own output** (not "looks good").
- [ ] Allowed AND forbidden scope both present.
- [ ] Says what to do after a failed check.
- [ ] Has a turn/time stop clause (no infinite loop). Condition ≤ 4000 chars.
- [ ] Subjective work has a reviewer/checklist gate.
- [ ] Launch offered, not auto-run.

## Common repairs

- Vague goal → replace "좋게 만들어" with the exact user-visible change.
- Un-checkable condition ("well-designed") → swap for something the transcript shows (`tsc --noEmit` exits 0).
- No bound → add `or stop after N turns`.
- Scope creep risk → name the dirs that may change; list forbidden ones.
- Subjective finish line → adversarial review pass or concrete acceptance examples.

## Output style

Return the finished goal block + the one-line launch command (Claude) or handoff payload
(Codex). If assumptions were needed, put a short `가정:` block inside. Then ask whether to
launch.
