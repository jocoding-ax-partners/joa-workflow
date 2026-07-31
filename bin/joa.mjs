#!/usr/bin/env node
// joa 워크플로 게이트. 스킬(마크다운)은 순서를 서술하고, 통과 판정은 전부 여기서 한다.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** 워크플로 단계. 순서가 곧 의존이다 — 앞 게이트가 통과해야 뒤가 열린다. */
export const PHASES = ["spec", "front", "plan", "teach", "loop"];

const statePath = (root) => join(root, ".joa", "state.json");

export function readState(root) {
  const path = statePath(root);
  if (!existsSync(path)) {
    return { phase: PHASES[0], gates: {} };
  }
  const raw = readFileSync(path, "utf8");
  try {
    return JSON.parse(raw);
  } catch (err) {
    // 조용히 초기화하면 통과 기록이 사라진 것과 새로 시작한 것이 구별되지 않는다.
    throw new Error(`.joa/state.json 을 읽을 수 없다: ${err.message}`);
  }
}

export function writeState(root, state) {
  const path = statePath(root);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`);
}

/** 다음으로 열려야 할 단계 = 통과하지 않은 첫 단계. */
function nextPhase(state) {
  return PHASES.find((p) => !state.gates[p]?.passed) ?? PHASES[PHASES.length - 1];
}

export function requirePhase(root, phase) {
  if (!PHASES.includes(phase)) {
    throw new Error(`알 수 없는 단계: ${phase}`);
  }
  const state = readState(root);
  const missing = PHASES.slice(0, PHASES.indexOf(phase)).find((p) => !state.gates[p]?.passed);
  return missing ? { ok: false, missing } : { ok: true };
}

/**
 * 거부 문구. **두 경로를 다 준다** — 앞 단계를 지금 하는 길과, joa 도입 이전에 이미
 * 끝낸 단계를 증거와 함께 통과 처리하는 길. 앞 단계 스킬이 아직 없을 수도 있어
 * 스킬 이름만 가리키면 막다른 안내가 된다. 우회는 숨긴다고 막히지 않고,
 * 실제 통제는 `pass` 에 남는 증거 문자열이다.
 */
export function refusalMessage(phase, missing, invokedAs) {
  return [
    `거부: ${phase} 단계를 시작할 수 없다. "${missing}" 게이트가 통과되지 않았다.`,
    `→ 그 단계를 지금 한다면: joa:${missing} 스킬`,
    `→ joa 도입 전에 이미 끝낸 단계라면 증거를 남기고 통과 처리한다:`,
    `   node ${invokedAs} pass ${missing} "<무엇을 근거로 통과했는지>"`,
  ].join("\n");
}

export function passPhase(root, phase, evidence) {
  if (!PHASES.includes(phase)) {
    throw new Error(`알 수 없는 단계: ${phase}`);
  }
  if (!evidence?.trim()) {
    throw new Error("evidence 가 비어 있다 — 무엇을 실행해 통과했는지 적는다");
  }
  const state = readState(root);
  state.gates[phase] = { passed: true, evidence: evidence.trim(), at: new Date().toISOString() };
  state.phase = nextPhase(state);
  writeState(root, state);
  return state;
}

/** 게이트를 무른다. 증거는 지우지 않는다 — 무엇을 근거로 통과했었는지가 감사 대상이다. */
export function backPhase(root, phase) {
  if (!PHASES.includes(phase)) {
    throw new Error(`알 수 없는 단계: ${phase}`);
  }
  const state = readState(root);
  for (const p of PHASES.slice(PHASES.indexOf(phase))) {
    if (state.gates[p]) {
      state.gates[p].passed = false;
    }
  }
  state.phase = nextPhase(state);
  writeState(root, state);
  return state;
}

function renderStatus(state) {
  const rows = PHASES.map((p) => {
    const g = state.gates[p];
    const mark = g?.passed ? "OK  " : "    ";
    const detail = g ? `${g.at ?? ""} ${g.evidence ?? ""}`.trim() : "";
    return `${mark}${p.padEnd(6)}${detail}`;
  });
  return [`현재 단계: ${state.phase}`, "", ...rows].join("\n");
}

/**
 * 지금 작업트리의 변경집합 해시. 리뷰 판정을 이 값에 묶어 **다른 스냅샷을 잰 증거**를 거른다.
 * 추적 변경(`git diff HEAD`)과 추적되지 않은 새 파일 내용을 모두 넣는다 — untracked 를
 * 빠뜨리면 새로 만든 파일이 리뷰를 통째로 우회한다.
 */
export function changeSetHash(root) {
  const git = (args) => execFileSync("git", args, { cwd: root, maxBuffer: 256 * 1024 * 1024 });
  const hash = createHash("sha256");
  hash.update(git(["diff", "HEAD"]));
  const untracked = git(["ls-files", "--others", "--exclude-standard", "-z"])
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .sort();
  for (const path of untracked) {
    hash.update(path);
    hash.update(readFileSync(join(root, path)));
  }
  return `sha256:${hash.digest("hex")}`;
}

/**
 * 완료 바닥. **모델이 아니라 코드가 센다** — 큐에 미체크 항목이 남아 있으면 완료가 아니다.
 * blocker 를 세려면 `- [ ]` 로 적어야 한다. 산문을 파싱하지 않는 이유는, 파싱이 틀리는 순간
 * 게이트가 조용히 통과되기 때문이다.
 */
export function completionFloor(paths) {
  const byFile = paths.map((path) => {
    if (!existsSync(path)) {
      throw new Error(`큐 파일이 없다: ${path}`);
    }
    const open = readFileSync(path, "utf8")
      .split("\n")
      .filter((line) => /^\s*- \[ \]/.test(line)).length;
    return { path, open };
  });
  return { floor: byFile.reduce((sum, f) => sum + f.open, 0), byFile };
}

/**
 * 방법론 정본. 골 문서는 이걸 참조만 하고 재서술하지 않는다.
 *
 * **경로가 아니라 마커로 잡는다.** 플러그인 설치 경로에는 버전이 박혀 있어
 * (`.../joa/1.2.0/WORKFLOW.md`), 경로 문자열을 요구하면 플러그인을 올릴 때마다
 * 레포의 골 문서가 한꺼번에 빨개진다. 참조가 살아 있는지만 재면 된다.
 */
export const CANON_LABEL = "joa 플러그인의 WORKFLOW.md";
export const CANON_RE = /joa\b[^\n]*WORKFLOW\.md/i;

/** 워크플로 전체를 지배하는 원칙. 게이트가 열릴 때마다 찍어 눈앞에 둔다. */
export const PRINCIPLE = [
  "검증 대원칙: 다른 것을 잰 증거를 통과의 근거로 쓰지 않는다.",
  "  판정하려는 층에서 잰다 — 화면을 판정하려면 브라우저가 읽는 값을 단언한다.",
  "  파이프라인 끝의 종료코드를 앞 명령의 것으로 착각하지 않는다.",
  "  래칫 수치(배선 gap·커버리지 기대값)는 내려가기만 한다. 올리기 금지.",
].join("\n");

/** 정본의 절 제목을 골 문서가 다시 쓴 흔적. 절 제목만 본다 — 산문을 잡으면 오탐이 난다. */
const RESTATED = [
  /^#+ .*이터레이션 = /,
  /^#+ .*커밋 규율/,
  /^#+ .*변이 주입/,
  /^#+ .*(허용되는 테스트 수정|허용 \/ 금지 테스트 수정)/,
];

/**
 * 골 문서 정합 검사. **규칙이 있는지가 아니라, 정본이 한 벌인지를 잰다.**
 * 골마다 방법론을 새로 쓰면 문서 수만큼 정본이 생기고, 그때부터 서로 어긋난다.
 */
export function checkGoalDocs(root, dir = "docs/goal") {
  const base = join(root, dir);
  const findings = [];
  if (!existsSync(base)) {
    return { ok: false, findings: [`${dir} 가 없다 — 골 문서를 먼저 만든다`] };
  }
  const prompts = readdirSync(base)
    .filter((f) => f.endsWith("-loop.md") || f.endsWith("-goal.md"))
    .sort();
  if (prompts.length === 0) {
    // 대상이 0개인 초록은 "아무것도 안 재는 검사" 와 구별되지 않는다.
    return { ok: false, findings: [`${dir} 에 골 프롬프트(*-loop.md · *-goal.md)가 없다`] };
  }
  for (const name of prompts) {
    const text = readFileSync(join(base, name), "utf8");
    if (!CANON_RE.test(text.split("\n").slice(0, 8).join("\n"))) {
      findings.push(`${dir}/${name} 첫 8줄에 ${CANON_LABEL} 참조가 없다 — 방법론이 상속되지 않는다`);
    }
    for (const line of text.split("\n")) {
      if (RESTATED.some((re) => re.test(line))) {
        findings.push(`${dir}/${name} 이 정본의 절을 재서술한다: ${line.trim()}`);
      }
    }
  }
  return { ok: findings.length === 0, findings, checked: prompts };
}

/**
 * 빈 캡처 판정 임계(바이트/픽셀). 단색은 0.001 수준, 글자만 있는 흰 화면도 0.02 를 넘는다.
 * ponytail: 픽셀을 디코드하지 않고 압축 밀도로 잰다 — 단색·거의-빈 캡처를 잡는 데는 충분하다.
 * 오탐이 실제로 생기면 그때 IDAT 을 inflate 해 픽셀 분산으로 올린다.
 */
export const UNIFORM_DENSITY = 0.01;

const PNG_MAGIC = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export function pngDensity(path) {
  const buf = readFileSync(path);
  if (!buf.subarray(0, 8).equals(PNG_MAGIC)) {
    throw new Error(`PNG 가 아니다: ${path}`);
  }
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  if (width === 0 || height === 0) {
    throw new Error(`PNG 크기가 0 이다: ${path}`);
  }
  return { width, height, bytes: buf.length, density: buf.length / (width * height) };
}

export function main(argv) {
  const root = process.cwd();
  const [cmd, ...rest] = argv;
  switch (cmd) {
    case "status":
      console.log(renderStatus(readState(root)));
      return 0;
    case "require": {
      const phase = rest[0];
      const result = requirePhase(root, phase);
      if (result.ok) {
        return 0;
      }
      console.error(refusalMessage(phase, result.missing, process.argv[1] ?? "joa.mjs"));
      return 1;
    }
    case "pass":
      passPhase(root, rest[0], rest.slice(1).join(" "));
      console.log(renderStatus(readState(root)));
      // 원칙을 스킬 6벌에 복붙하면 정본이 6개가 된다. 게이트가 열릴 때 여기서 한 번 찍는다.
      console.log(`\n${PRINCIPLE}`);
      return 0;
    case "back":
      backPhase(root, rest[0]);
      console.log(renderStatus(readState(root)));
      return 0;
    case "freeze": {
      const current = changeSetHash(root);
      const checkIndex = rest.indexOf("--check");
      if (checkIndex === -1) {
        console.log(current);
        return 0;
      }
      const expected = rest[checkIndex + 1];
      if (expected === current) {
        console.log(`OK 변경집합이 동결 시점과 같다 (${current})`);
        return 0;
      }
      console.error(
        `거부: 판정이 다른 스냅샷을 쟀다.\n  동결: ${expected}\n  현재: ${current}\n` +
          `코드가 리뷰 도중 바뀌었다. 다시 동결하고 리뷰를 새 세대로 돌려라.`,
      );
      return 1;
    }
    case "floor": {
      const paths = rest.length > 0 ? rest : ["docs/goal/fix_plan.md"];
      const { floor, byFile } = completionFloor(paths);
      for (const f of byFile) {
        console.log(`${String(f.open).padStart(4)}  ${f.path}`);
      }
      if (floor === 0) {
        console.log("OK 바닥 0 — 미해결 항목이 없다");
        return 0;
      }
      console.error(`거부: 미해결 항목 ${floor} 건이 남아 완료를 선언할 수 없다.`);
      return 1;
    }
    case "docs": {
      const { ok, findings, checked } = checkGoalDocs(root, rest[0] ?? "docs/goal");
      if (ok) {
        console.log(`OK 골 문서 ${checked.length} 장이 정본 한 벌을 참조한다 (${checked.join(", ")})`);
        return 0;
      }
      for (const f of findings) {
        console.error(`  ${f}`);
      }
      console.error(`거부: 골 문서가 정본(${CANON_LABEL})과 어긋난다.`);
      return 1;
    }
    case "shot": {
      if (rest.length === 0) {
        console.error("usage: joa.mjs shot <png...>");
        return 2;
      }
      let failed = 0;
      for (const path of rest) {
        const { width, height, density } = pngDensity(path);
        const ok = density >= UNIFORM_DENSITY;
        if (!ok) {
          failed++;
        }
        console.log(
          `${ok ? "OK  " : "빈캡처"} ${path} ${width}x${height} 밀도 ${density.toFixed(4)}`,
        );
      }
      if (failed === 0) {
        return 0;
      }
      console.error(
        `거부: ${failed} 장이 사실상 빈 화면이다. 화면이 실제로 그려졌는지 확인하고 다시 찍어라.`,
      );
      return 1;
    }
    default:
      console.error("usage: joa.mjs <status|require|pass|back|freeze|floor|docs|shot> [args]");
      return 2;
  }
}

if (import.meta.filename === process.argv[1]) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }
}
