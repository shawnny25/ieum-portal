import { NextResponse } from "next/server";
import { me, serverClient } from "@/lib/supabase/server";
import { r2Configured, putUrl, getUrl } from "@/lib/r2";

// R2 서명 URL 발급. 경로 권한은 Supabase 스토리지 정책과 동일:
//   admin → 전부, org → org-{내 org}/ (이용기간 내), expert → expert-{내 uid}/
// POST { op: "put"|"get", path, contentType?, name? }
export async function POST(req) {
  if (!r2Configured()) return NextResponse.json({ error: "R2 미설정" }, { status: 503 });
  const p = await me();
  if (!p) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { op, path, contentType, name } = await req.json();
  if (!path || path.includes("..") || path.startsWith("/")) return NextResponse.json({ error: "bad path" }, { status: 400 });

  const folder = path.split("/")[0];
  let allowed = p.role === "admin";
  if (p.role === "org" && folder === `org-${p.org_id}`) {
    const s = await serverClient();
    const { data: ok } = await s.rpc("org_active", { oid: p.org_id });
    allowed = !!ok;
  }
  if (p.role === "expert" && folder === `expert-${p.id}`) allowed = true;
  // 전문가·기관은 다운로드도 본인 폴더만. 관리자만 전체.
  if (!allowed) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const url = op === "put" ? await putUrl(path, contentType || "application/octet-stream") : await getUrl(path, name || path.split("/").pop());
  return NextResponse.json({ url });
}
