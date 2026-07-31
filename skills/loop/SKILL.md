---
name: loop
description: 계획이 확정된 기능을 이터레이션 루프로 구현한다. 사용자가 이해를 마친 계획(joa:teach 통과)이 있고 "구현 시작", "루프 돌려", "joa:loop" 이라고 할 때 사용한다. goal-builder 틀로 골 문서(docs/goal/*.md)를 쓰게 강제하고 /goal 한 줄을 조립한 뒤, 서브에이전트로 구현하고 변이 주입·소스해시 동결·화면 QA 로 게이트한다.
---

# joa:loop

7단계(루프 구현)를 담당한다. 이 스킬 자체는 순서만 서술하고, 통과 판정은 전부
`${CLAUDE_PLUGIN_ROOT}/bin/joa.mjs` 가 한다. 스스로 "됐다"고 판단해 게이트를 건너뛰지 않는다.

## 1. 진입 가드

가장 먼저 실행한다:

```bash
node ${CLAUDE_PLUGIN_ROOT}/bin/joa.mjs require loop
```

exit 1 이면 **즉시 멈추고** 스크립트가 출력한 문장을 그대로 사용자에게 전달한다.
스스로 판단해 진행하지 않는다.

## 2. 골 세팅

방법론 정본은 **joa 플러그인의 `WORKFLOW.md`** 하나다. 레포마다 복사본을 두면 레포 수만큼
정본이 생기고, 그건 정본을 세워서 없애려던 상태 그대로다. 골 문서는 그 파일을 참조하고
**델타만** 적는다.

상태를 대화가 아니라 디스크에 둔다. **두 파일을 실제로 쓰기 전에는 4절로 넘어가지 않는다.**
없으면 여기서 만든다:

- `docs/goal/<골>-loop.md` — 이 골의 정형 골 문서. 본문은 3절의 `goal-builder` 블록을
  **빈칸 없이 채운 것**이다. **첫 8줄 안에** 정본 참조 줄을 그대로 넣는다:

  ```markdown
  > 방법론 정본: joa 플러그인의 WORKFLOW.md — 여기는 델타만 적는다.
  ```

  `docs` 검사는 이 줄을 **경로가 아니라 마커로** 찾는다. 플러그인 캐시 경로에는 버전이
  박혀 있어(`.../joa/1.2.0/`), 경로를 적으면 플러그인을 올릴 때 골 문서가 전부 빨개진다
- `docs/goal/fix_plan.md` — 큐. **`joa:plan` 이 남긴 계획 문서에서 항목을 뽑아 `- [ ]` 로 적는다.**
  `joa.mjs floor` 는 `- [ ]` 만 센다 — 산문으로 적은 blocker 는 세지 않으므로,
  남은 일은 반드시 체크박스로 적는다

쓰고 나서 확인한다. **셋 다 exit 0 이어야 4절로 간다.** 각각 다른 것을 잰다 —
하나로 뭉치면 무엇이 빠졌는지 알 수 없다:

```bash
grep -q "^멈춤 조건:" docs/goal/<골>-loop.md        # goal-builder 틀의 필수 칸이 채워졌는가
node ${CLAUDE_PLUGIN_ROOT}/bin/joa.mjs docs                     # 정본 한 벌을 참조하는가 · 재서술 없는가
node ${CLAUDE_PLUGIN_ROOT}/bin/joa.mjs floor docs/goal/fix_plan.md   # 큐가 비어 있으면 애초에 돌 일이 없다
```

`docs` 가 거부하면 골 문서가 **joa 플러그인의 `WORKFLOW.md`** 를 첫 8줄에서 참조하지 않았거나,
정본의 절(이터레이션·커밋 규율·변이 주입)을 다시 쓴 것이다. 재서술을 지우고 참조만 남긴다.

**큐가 곧 상태다. 대화는 상태가 아니다.** 무엇을 했고 무엇이 남았는지는 항상 큐에서 읽는다.

## 3. 골 프롬프트 작성 — `goal-builder` 틀 그대로

**직접 지어내지 않는다.** `goal-builder` 스킬을 호출해 그 정형 틀에 맞춰 쓴다. 인터뷰
단계(Phase 1)는 이미 `joa:spec`~`joa:teach` 에서 답이 나와 있으므로 새로 묻지 말고,
**계약·계획 문서·`fix_plan.md` 에서 값을 끌어와 Phase 2 블록을 채운다.** 확정되지 않은
칸이 남으면 그 칸의 답이 없는 것이므로 루프를 시작하지 않는다.

채워야 할 8칸(`goal-builder` Phase 2):

```text
목표:        <끝났을 때 무엇이 관찰 가능하게 달라지는지 한 문장>
완료 기준:   <매 턴 에이전트가 직접 실행해 출력이 대화에 남는 것만>
범위:        <수정 가능 / 읽기 참고 / 산출물>
금지 사항:   <계약 패키지·테스트 약화·실 크레덴셜·브랜치 전환 등>
반복 방식:   <4절 이터레이션 5단계>
검증:        <실행 명령 · 확인 화면·URL · 기동돼 있어야 할 스택>
멈춤 조건:   <완료 + 증거 / N턴·T분 초과 / 계약 변경 필요>   ← 무한루프 방지, 필수
최종 보고:   <변경 파일 · 검증 결과 · 남은 리스크>
```

이 블록을 통째로 `docs/goal/<골>-loop.md` 에 저장한다. 대화에만 남기지 않는다 —
컨텍스트가 리셋되면 사라진다.

### 3-1. /goal 한 줄 — 사용자에게 넘긴다

`/goal` 은 사용자가 직접 치는 빌트인이라 이 스킬이 띄울 수 없다. 위 블록을 한 줄로 증류해 건넨다.

**평가자는 트랜스크립트만 읽는다.** 파일을 열지도, 명령을 돌리지도 않는다. 따라서 완료
조건은 **에이전트가 매 턴 직접 실행해 출력이 대화에 남는 것**이어야 한다. 아래 세 명령이
그 모양이므로 그대로 박는다. 턴 상한은 필수다(무한 루프 방지).

```
/goal docs/goal/<골>-loop.md 의 완료 기준을 전부 충족한다:
`node ${CLAUDE_PLUGIN_ROOT}/bin/joa.mjs floor docs/goal/fix_plan.md` 가 exit 0 이고,
`pnpm build && pnpm typecheck && pnpm lint && pnpm test` 가 전부 exit 0 이고,
화면 QA 스크린샷이 `node ${CLAUDE_PLUGIN_ROOT}/bin/joa.mjs shot <png들>` 을 통과했다.
매 이터레이션마다 커밋한다. 계약 패키지·응시 규칙·실 크레덴셜은 수정하지 않는다.
또는 <N>턴 후 진행상황을 보고하고 멈춘다
```

`<골>` 과 `<N>` 을 실제 값으로 채운 뒤, 사용자에게 **이 한 줄을 직접 치라고** 안내한다.
자동 실행하지 않는다. Auto 모드를 켜면 매 턴이 무인으로 돈다는 것도 함께 알린다.

## 4. 이터레이션 5단계

큐 맨 위 항목 하나씩:

1. **계획** — `superpowers:writing-plans` 로 이번 이터레이션 범위를 짠다.
2. **RED 테스트** — 실패하는 테스트부터 쓴다.
3. **구현** — `superpowers:subagent-driven-development` 로 서브에이전트에 위임한다.
4. **GREEN + 게이트** — 아래 "변이 주입" 을 통과해야 GREEN 으로 인정한다.
5. **화면 QA** — 아래 "화면 QA" 절을 커밋 전에 수행한다.

끝내면 큐 항목을 체크하고 **커밋한다.** 커밋 메시지가 저널이고 git 히스토리가 기억이다.

**병렬 규칙:** `subagent-driven-development` 는 구현 병렬을 금지한다. 병렬은
**쓰기 경로 교집합이 공집합이 되도록 파일 소유를 먼저 배분한 경우에만** 허용한다.

## 5. 변이 주입

GREEN 이 나온 뒤, 방금 통과한 가드(assert·조건)를 되돌려 다시 빨개지는지 확인한다.
안 빨개지면 그 테스트는 아무것도 재지 않는 것이므로 통과가 아니다.

## 6. 화면 QA

gstack `browse` 로 실제 화면을 본다. 리뷰 시작 시 소스를 동결하고, 리뷰가 끝날 때까지
코드가 안 바뀌었는지 확인한다:

```bash
node ${CLAUDE_PLUGIN_ROOT}/bin/joa.mjs freeze          # 해시 기록
# …browse snapshot/fill/click/console/network/screenshot…
node ${CLAUDE_PLUGIN_ROOT}/bin/joa.mjs shot e2e/__screenshots__/*.png
node ${CLAUDE_PLUGIN_ROOT}/bin/joa.mjs freeze --check <동결 해시>
```

콘솔 에러 0 · 실패 요청 0 이 아니면 통과가 아니다. `shot` 이 거부하면 화면이 실제로
안 그려진 것이다.

## 7. 종료 게이트

셋 다 통과해야 끝난다:

```bash
node ${CLAUDE_PLUGIN_ROOT}/bin/joa.mjs floor docs/goal/fix_plan.md
pnpm build && pnpm typecheck && pnpm lint && pnpm test
node ${CLAUDE_PLUGIN_ROOT}/bin/joa.mjs pass loop "<무엇을 실행해 통과했는지>"
```

`floor` 가 0 이 아니면 완료를 선언하지 않는다. 남은 항목은 사용자에게 그대로 보고한다.
