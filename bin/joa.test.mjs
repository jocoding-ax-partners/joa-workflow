import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { deflateSync } from "node:zlib";

import {
  backPhase,
  changeSetHash,
  completionFloor,
  passPhase,
  pngDensity,
  readState,
  checkGoalDocs,
  refusalMessage,
  requirePhase,
  PHASES,
  UNIFORM_DENSITY,
  CANON_LABEL,
  CANON_RE,
} from "./joa.mjs";

function fixture() {
  return mkdtempSync(join(tmpdir(), "joa-test-"));
}

test("PHASES 순서가 고정돼 있다", () => {
  assert.deepEqual(PHASES, ["spec", "front", "plan", "teach", "loop"]);
});

test("상태 파일이 없으면 첫 단계만 열려 있다", () => {
  const root = fixture();
  assert.equal(requirePhase(root, "spec").ok, true);
  assert.equal(requirePhase(root, "front").ok, false);
  assert.equal(requirePhase(root, "front").missing, "spec");
});

test("pass 하면 다음 단계가 열린다", () => {
  const root = fixture();
  passPhase(root, "spec", "사용자 승인 2026-08-01");
  assert.equal(requirePhase(root, "front").ok, true);
  assert.equal(requirePhase(root, "plan").ok, false);
  assert.equal(requirePhase(root, "plan").missing, "front");
});

test("건너뛴 게이트가 있으면 가장 앞의 것을 지목한다", () => {
  const root = fixture();
  passPhase(root, "spec", "e");
  passPhase(root, "plan", "e");
  assert.equal(requirePhase(root, "loop").missing, "front");
});

test("pass 는 증거와 시각을 남긴다", () => {
  const root = fixture();
  passPhase(root, "spec", "스크린샷 3장 확인");
  const state = readState(root);
  assert.equal(state.gates.spec.passed, true);
  assert.equal(state.gates.spec.evidence, "스크린샷 3장 확인");
  assert.match(state.gates.spec.at, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(state.phase, "front");
});

test("증거 없는 pass 는 거부한다", () => {
  const root = fixture();
  assert.throws(() => passPhase(root, "spec", ""), /evidence/);
});

test("back 은 증거를 남기고 게이트만 무른다", () => {
  const root = fixture();
  passPhase(root, "spec", "원래 증거");
  passPhase(root, "front", "e2");
  backPhase(root, "spec");
  const state = readState(root);
  assert.equal(state.gates.spec.passed, false);
  assert.equal(state.gates.spec.evidence, "원래 증거");
  assert.equal(state.gates.front.passed, false, "뒤 단계도 함께 풀린다");
  assert.equal(state.phase, "spec");
});

test("깨진 상태 파일은 조용히 초기화하지 않고 던진다", () => {
  const root = fixture();
  mkdirSync(join(root, ".joa"));
  writeFileSync(join(root, ".joa", "state.json"), "{ not json");
  assert.throws(() => readState(root), /state\.json/);
});

function gitFixture() {
  const root = mkdtempSync(join(tmpdir(), "joa-git-"));
  const git = (...args) => execFileSync("git", args, { cwd: root });
  git("init", "-q");
  git("config", "user.email", "t@t.t");
  git("config", "user.name", "t");
  writeFileSync(join(root, "a.txt"), "one\n");
  git("add", "a.txt");
  git("commit", "-qm", "init");
  return { root, git };
}

test("변경이 없으면 해시가 안정적이다", () => {
  const { root } = gitFixture();
  assert.equal(changeSetHash(root), changeSetHash(root));
  assert.match(changeSetHash(root), /^sha256:[0-9a-f]{64}$/);
});

test("추적 파일이 바뀌면 해시가 바뀐다", () => {
  const { root } = gitFixture();
  const before = changeSetHash(root);
  writeFileSync(join(root, "a.txt"), "two\n");
  assert.notEqual(changeSetHash(root), before);
});

test("추적되지 않은 새 파일도 해시에 반영된다", () => {
  const { root } = gitFixture();
  const before = changeSetHash(root);
  writeFileSync(join(root, "b.txt"), "new\n");
  assert.notEqual(changeSetHash(root), before, "untracked 를 빠뜨리면 새 파일이 리뷰를 우회한다");
});

test("무시된 파일은 해시를 흔들지 않는다", () => {
  const { root, git } = gitFixture();
  writeFileSync(join(root, ".gitignore"), "junk/\n");
  git("add", ".gitignore");
  git("commit", "-qm", "ignore");
  const before = changeSetHash(root);
  mkdirSync(join(root, "junk"));
  writeFileSync(join(root, "junk", "x.log"), "noise\n");
  assert.equal(changeSetHash(root), before);
});

test("미체크 항목 수가 바닥이 된다", () => {
  const root = fixture();
  const p = join(root, "queue.md");
  writeFileSync(p, "# q\n\n- [x] 끝난 것\n- [ ] 남은 것 A\n- [ ] 남은 것 B\n");
  assert.equal(completionFloor([p]).floor, 2);
});

test("전부 체크되면 바닥이 0 이다", () => {
  const root = fixture();
  const p = join(root, "queue.md");
  writeFileSync(p, "- [x] a\n- [x] b\n");
  assert.equal(completionFloor([p]).floor, 0);
});

test("들여쓴 하위 항목도 센다", () => {
  const root = fixture();
  const p = join(root, "queue.md");
  writeFileSync(p, "- [ ] 상위\n  - [ ] 하위\n");
  assert.equal(completionFloor([p]).floor, 2);
});

test("산문 속 blocker 라는 낱말은 세지 않는다", () => {
  const root = fixture();
  const p = join(root, "queue.md");
  writeFileSync(p, "남은 blocker 가 세 개 있다고 여기 적어둔다.\n- [x] a\n");
  assert.equal(completionFloor([p]).floor, 0);
});

test("파일별 내역을 함께 돌려준다", () => {
  const root = fixture();
  const a = join(root, "a.md");
  const b = join(root, "b.md");
  writeFileSync(a, "- [ ] x\n");
  writeFileSync(b, "- [x] y\n");
  const result = completionFloor([a, b]);
  assert.equal(result.floor, 1);
  assert.deepEqual(
    result.byFile.map((f) => f.open),
    [1, 0],
  );
});

test("없는 파일은 조용히 0 이 아니라 오류다", () => {
  assert.throws(() => completionFloor(["/nope/queue.md"]), /queue\.md/);
});

/** 최소 PNG 인코더 — 테스트 픽스처용. 필터 0(None)으로 raw 스캔라인을 넣는다. */
function makePng(width, height, pixelAt) {
  const raw = Buffer.alloc(height * (1 + width * 3));
  let o = 0;
  for (let y = 0; y < height; y++) {
    raw[o++] = 0;
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixelAt(x, y);
      raw[o++] = r;
      raw[o++] = g;
      raw[o++] = b;
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function crc32(buf) {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) {
      c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
  }
  return ~c;
}

test("PNG 헤더에서 크기를 읽는다", () => {
  const root = fixture();
  const p = join(root, "solid.png");
  writeFileSync(
    p,
    makePng(64, 32, () => [255, 255, 255]),
  );
  const info = pngDensity(p);
  assert.equal(info.width, 64);
  assert.equal(info.height, 32);
});

test("단색 캡처는 밀도가 임계 아래다", () => {
  const root = fixture();
  const p = join(root, "solid.png");
  writeFileSync(
    p,
    makePng(400, 300, () => [255, 255, 255]),
  );
  assert.ok(pngDensity(p).density < UNIFORM_DENSITY);
});

test("실제 화면처럼 잡음이 있으면 임계 위다", () => {
  const root = fixture();
  const p = join(root, "noisy.png");
  let seed = 1;
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) % 256;
  writeFileSync(
    p,
    makePng(400, 300, () => [rand(), rand(), rand()]),
  );
  assert.ok(pngDensity(p).density > UNIFORM_DENSITY);
});

test("PNG 가 아니면 거부한다", () => {
  const root = fixture();
  const p = join(root, "x.png");
  writeFileSync(p, "not a png");
  assert.throws(() => pngDensity(p), /PNG/);
});

test("거부 문구는 두 경로를 다 준다", () => {
  const msg = refusalMessage("loop", "spec", "/home/u/.agents/bin/joa.mjs");
  assert.match(msg, /"spec" 게이트가 통과되지 않았다/);
  assert.match(msg, /joa:spec/, "앞 단계 스킬 경로");
  assert.match(
    msg,
    /node \/home\/u\/\.agents\/bin\/joa\.mjs pass spec/,
    "스킬이 아직 없을 때 막다른 안내가 되지 않도록 pass 경로도 준다",
  );
});

test("거부 문구는 실제로 호출된 경로를 그대로 쓴다", () => {
  const msg = refusalMessage("plan", "front", "scripts/joa/joa.mjs");
  assert.match(msg, /node scripts\/joa\/joa\.mjs pass front/);
});

// ── docs: 골 문서 정합 ───────────────────────────────────────────────
function goalRepo(files) {
  const root = mkdtempSync(join(tmpdir(), "joa-docs-"));
  mkdirSync(join(root, "docs", "goal"), { recursive: true });
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(root, "docs", "goal", name), body);
  }
  return root;
}

const GOOD = `# 예시 골\n\n방법론 정본은 joa 플러그인의 WORKFLOW.md 다. 여기는 델타만 적는다.\n\n목표:\n목록 화면이 뜬다.\n\n멈춤 조건:\n30턴.\n`;

test("정본을 참조하고 재서술하지 않으면 통과", () => {
  const root = goalRepo({ "backoffice-loop.md": GOOD });
  const { ok, checked } = checkGoalDocs(root);
  assert.equal(ok, true);
  assert.deepEqual(checked, ["backoffice-loop.md"]);
});

test("첫 8줄에 정본 참조가 없으면 거부", () => {
  // 변이: 참조를 9번째 줄로 밀어낸다 — 상속이 눈에 안 들어오는 위치다.
  const pushed = `${"# 제목\n\n".repeat(5)}참조: joa 플러그인의 WORKFLOW.md\n`;
  const { ok, findings } = checkGoalDocs(goalRepo({ "x-loop.md": pushed }));
  assert.equal(ok, false);
  assert.match(findings[0], /첫 8줄/);
});

test("정본의 절을 재서술하면 거부", () => {
  // 변이: METHOD 시절처럼 방법론 절을 골 문서에 되살린다.
  const dup = `${GOOD}\n## 이터레이션 = 기획 → 테스트 작성 → 구현\n`;
  const { ok, findings } = checkGoalDocs(goalRepo({ "x-loop.md": dup }));
  assert.equal(ok, false);
  assert.match(findings[0], /재서술/);
});

test("골 프롬프트가 0개면 통과가 아니다", () => {
  // 대상 0개의 초록은 아무것도 안 잰 초록과 구별되지 않는다.
  const { ok, findings } = checkGoalDocs(goalRepo({ "fix_plan.md": "- [ ] 할 일\n" }));
  assert.equal(ok, false);
  assert.match(findings[0], /골 프롬프트/);
});

test("docs 디렉토리가 없으면 거부", () => {
  const root = mkdtempSync(join(tmpdir(), "joa-nodocs-"));
  assert.equal(checkGoalDocs(root).ok, false);
});

test("pass 는 검증 대원칙을 함께 찍는다", () => {
  const root = mkdtempSync(join(tmpdir(), "joa-principle-"));
  const out = execFileSync(process.execPath, [join(import.meta.dirname, "joa.mjs"), "pass", "spec", "테스트"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.match(out, /다른 것을 잰 증거/);
});
