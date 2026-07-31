# joa

기능 하나를 **기획부터 루프 구현까지 순서대로** 밀어붙이는 Claude Code 워크플로 스킬셋.

다음에 뭘 할지 매번 생각하고 프롬프트를 새로 쓰는 대신, 스킬 다섯 개를 순서대로 부른다.
**판정은 스킬이 하지 않는다** — `bin/joa.mjs` 가 게이트를 열고 닫고, 앞 단계가 통과하지
않았으면 뒷 단계는 시작 자체를 거부한다.

## 설치

```
/plugin marketplace add jocoding-ax-partners/joa-workflow
/plugin install joa@joa
```

[superpowers](https://github.com/obra/superpowers-marketplace) 를 같이 깔아야 한다.
`joa:spec` 은 `brainstorming`, `joa:plan` 은 `writing-plans`, `joa:loop` 는
`subagent-driven-development` 를 안에서 부른다.

## 5단계

| 스킬 | 단계 | 게이트 |
|---|---|---|
| `joa:spec` | 기획 초안 → ASCII 와이어프레임 → Claude Design 핸드오프 | 사용자 승인 + 문서 sha256 |
| `joa:front` | HTML → 실제 프론트 + mock API | 빌드·타입체크 + 스크린샷 |
| `joa:plan` | 계약 동결 → 병렬 상세 플랜 → 단일 e2e 정합검토 | typecheck + 계획 동결 해시 |
| `joa:teach` | 계획을 사용자에게 페이지 단위 점진 설명 | 사용자가 이해 완료 선언 |
| `joa:loop` | 골 문서·큐 세팅 → 이터레이션 구현 | 큐 바닥 0 + 게이트 4종 + 화면 QA |

어디쯤인지 모르면 `joa:start`. 현황을 보여주고 맞는 단계로 넘긴다.

## 왜 스크립트가 판정하는가

프롬프트는 서술하고, **게이트는 집행한다.** 모델이 "됐다"고 판단해 단계를 건너뛸 수 있으면
그 게이트는 게이트가 아니다. `joa.mjs` 는 다음을 코드로 잰다:

- `require <단계>` — 앞 게이트가 안 열렸으면 exit 1. 탈출구(증거를 남기고 통과 처리)를 함께 출력
- `pass <단계> "<증거>"` — 증거 문자열 없이는 통과 불가. **검증 대원칙을 매번 함께 출력**
- `floor <큐>` — `- [ ]` 개수를 센다. 남아 있으면 완료 선언 거부. 산문 blocker 는 세지 않는다
- `freeze` / `freeze --check` — 리뷰 시작 시 변경집합 해시를 박고, 끝날 때 같은 스냅샷을 쟀는지 확인
- `docs` — 골 문서가 정본 한 벌(`WORKFLOW.md`)을 참조하는지, 방법론을 재서술하지 않는지
- `shot <png…>` — 스크린샷 압축밀도로 사실상 빈 캡처를 거른다

## 대원칙

> **다른 것을 잰 증거를 통과의 근거로 쓰지 않는다.**

화면엔 0글자가 뜨는데 테스트는 초록이었던 사례가 실재한다. 판정하려는 층에서 잰다.
자세한 방법론은 [`WORKFLOW.md`](./WORKFLOW.md).

## 개발

```bash
node --test bin/joa.test.mjs
```

의존성 0. Node 22+.

## License

MIT
