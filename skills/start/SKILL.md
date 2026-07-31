---
name: start
description: 워크플로 라우터. "joa:start" 를 부르면 지금 단계의 스킬로 넘긴다. 인자 없이 부르면 단계별 게이트 현황을 보여주고, "joa:start back <단계>" 로 게이트를 무른다. 다음에 뭘 해야 할지 모를 때 여기서 시작한다.
---

# joa:start

`spec` → `front` → `plan` → `teach` → `loop` 5단계 워크플로의 진입점이다. **이 스킬은 작업을
하지 않는다.** `${CLAUDE_PLUGIN_ROOT}/bin/joa.mjs` 가 든 상태를 읽어서 맞는 단계 스킬로 넘길 뿐이다. 단계
스킬(`joa:spec`~`joa:loop`)의 내용을 여기 복사하거나 대신 서술하지 않는다.

## 동작은 3개뿐이다

### 1. 인자 없음 — `joa:start`

```bash
node ${CLAUDE_PLUGIN_ROOT}/bin/joa.mjs status
```

출력을 그대로 사용자에게 보여준 뒤, `현재 단계: <phase>` 의 `<phase>` 에 해당하는 스킬
(`joa:<phase>`, 예: `plan` → `joa:plan`)을 Skill 도구로 호출한다. 이 스킬 자신이 그 단계의
일을 대신하지 않는다 — 반드시 넘긴다.

### 2. `joa:start status`

```bash
node ${CLAUDE_PLUGIN_ROOT}/bin/joa.mjs status
```

출력만 보여준다. 여기서 끝. 어떤 단계 스킬도 호출하지 않는다.

### 3. `joa:start back <단계>`

```bash
node ${CLAUDE_PLUGIN_ROOT}/bin/joa.mjs back <단계>
```

실행한 뒤 사용자에게 분명히 알린다: **게이트만 풀렸고, 증거는 그대로 남아 있다.** 증거를
지우지 않는 이유는 그 게이트가 무엇을 근거로 통과됐었는지가 감사 대상이기 때문이다 —
`back` 은 재작업을 여는 것이지 기록을 지우는 것이 아니다.

## 이 워크플로 이전에 시작된 작업

앞 단계 게이트가 비어 있는 채로 이미 진행된 작업이면, 인자 없는 `joa:start` 는 `joa:spec` 으로
보내 끝난 기획을 다시 시키려 든다. 이 경우 각 단계 스킬의 진입 가드(`joa.mjs require <단계>`)
가 거부하면서 탈출구를 이미 출력한다 — `joa.mjs pass <단계> "<증거>"` 로 해당 게이트를 직접
채우라는 안내다. 이 라우터는 그 안내를 반복 설명하지 않고 그대로 가리킨다. 증거 문자열은
나중에 그 통과가 진짜였는지(무엇을 근거로 건너뛰었는지) 보여주는 유일한 흔적이므로, 대충
채우지 말라고 짧게 덧붙인다.

## 단계 이름

정확히 `spec` · `front` · `plan` · `teach` · `loop` 5개. 순서 고정.
