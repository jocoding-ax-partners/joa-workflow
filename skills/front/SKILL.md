---
name: front
description: Claude Design 이 내보낸 HTML 을 실제 프론트엔드로 옮기고 mock API 를 붙인다. "프론트 구현", "화면 만들어", "joa:front" 라고 하거나 joa:spec 게이트를 막 통과했을 때 사용한다. mock 핸들러가 다음 단계의 계약 입력이 된다.
---

# joa:front

4단계(프론트 구현 + mock)를 담당한다. 이 스킬 자체는 순서만 서술하고, 통과 판정은 전부
`${CLAUDE_PLUGIN_ROOT}/bin/joa.mjs` 가 한다. 스스로 "됐다"고 판단해 게이트를 건너뛰지 않는다.

## 1. 진입 가드

가장 먼저 실행한다:

```bash
node ${CLAUDE_PLUGIN_ROOT}/bin/joa.mjs require front
```

exit 1 이면 **즉시 멈추고** 스크립트가 출력한 문장을 그대로 사용자에게 전달한다.
스스로 판단해 진행하지 않는다.

## 2. 규칙 파일 참조

스택 규칙(상태관리·UI 라이브러리·아키텍처 슬라이스·컴포넌트 분리)은 프로젝트의
`.claude/rules/*.md` 에 있다. **브리프에 규칙 본문을 복붙하지 않는다** — 두 벌이 되면
갈라진다. 서브에이전트에게는 "규칙 읽고 그대로 따르라"고만 지시한다.

## 3. 구현

`superpowers:subagent-driven-development` 로 서브에이전트에 위임한다.

**병렬 규칙:** 화면 단위로, 쓰기 경로가 겹치지 않을 때만 병렬한다.

## 4. mock 이 곧 계약 초안

mock 핸들러가 "백엔드가 뭘 줘야 화면이 그려지는가"의 실측이다. 추측으로 필드를
만들지 말고, 화면이 실제로 요구하는 것만 넣는다. 이 mock 핸들러가 다음 단계
(`joa:plan`)의 계약 동결 입력이 된다.

## 5. 종료 게이트

셋 다 통과해야 끝난다:

```bash
pnpm build && pnpm typecheck
# gstack browse 로 전 화면을 걸어가며 screenshot 촬영
node ${CLAUDE_PLUGIN_ROOT}/bin/joa.mjs shot <찍은 png들>
node ${CLAUDE_PLUGIN_ROOT}/bin/joa.mjs pass front "<증거>"
```

콘솔 에러 0 · 실패 요청 0 이 아니면 통과가 아니다. `shot` 이 거부하면 화면이 실제로
안 그려진 것이다.

레포에 따라 `e2e/__screenshots__/` 가 gitignore 대상일 수 있다 — 그 경우 이번 실행에서
찍은 스크린샷만 남아 있는 것이 정상이다(오래된 캡처가 증거로 재사용되는 것을 막는다).
