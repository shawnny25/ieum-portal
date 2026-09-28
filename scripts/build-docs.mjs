// docs/*.html → PDF (Microsoft Edge 헤드리스 인쇄). 실행: node scripts/build-docs.mjs [출력 폴더]
// 기본 출력: 바탕화면\one\이음포털_문서. 문서를 고치면 HTML 원본을 수정하고 다시 실행한다.
import { execFileSync } from "node:child_process";
import { readdirSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const EDGE = ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe"].find(existsSync);
if (!EDGE) { console.error("Microsoft Edge 를 찾을 수 없습니다"); process.exit(1); }
const src = resolve("docs"), out = resolve(process.argv[2] || join(process.env.USERPROFILE, "Desktop", "one", "이음포털_문서"));
mkdirSync(out, { recursive: true });

for (const f of readdirSync(src).filter((n) => n.endsWith(".html"))) {
  const pdf = join(out, f.replace(/\.html$/, ".pdf"));
  execFileSync(EDGE, ["--headless", "--disable-gpu", "--no-pdf-header-footer", `--print-to-pdf=${pdf}`, pathToFileURL(join(src, f)).href], { stdio: "ignore" });
  console.log("✓", pdf);
}
