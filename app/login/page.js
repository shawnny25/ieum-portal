"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { sb } from "@/lib/supabase/client";

// 로그인 + 초대/재설정 링크로 들어왔을 때 비밀번호 설정
export default function Login() {
  const r = useRouter();
  const [mode, setMode] = useState("login");     // login | setpw
  const [email, setEmail] = useState(""); const [pw, setPw] = useState(""); const [pw2, setPw2] = useState("");
  const [msg, setMsg] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);

  useEffect(() => {
    const h = new URLSearchParams(window.location.hash.slice(1)), q = new URLSearchParams(window.location.search);
    const clean = () => window.history.replaceState(null, "", window.location.pathname);
    if (h.get("error_description")) { setErr("링크가 만료되었거나 이미 사용되었습니다. 비밀번호 재설정을 다시 요청해 주세요."); clean(); return; }
    // 대시보드·서버에서 보낸 링크(#access_token…): PKCE 클라이언트가 자동 처리하지 않으므로 직접 세션 설정
    if (h.get("access_token") && h.get("refresh_token")) {
      sb.auth.setSession({ access_token: h.get("access_token"), refresh_token: h.get("refresh_token") })
        .then(({ error }) => { if (error) setErr(`링크 처리 실패: ${error.message}`); else setMode("setpw"); clean(); });
      return;
    }
    // 이 화면에서 요청한 재설정 링크(?code=…): 클라이언트가 자동 교환 → 세션 생기면 비밀번호 설정으로
    if (q.has("code")) {
      const { data } = sb.auth.onAuthStateChange((_ev, session) => { if (session) { setMode("setpw"); clean(); } });
      return () => data.subscription.unsubscribe();
    }
  }, []);

  const login = async (e) => {
    e.preventDefault(); setBusy(true); setErr(""); setMsg("");
    const { error } = await sb.auth.signInWithPassword({ email, password: pw });
    setBusy(false);
    if (error) { setErr("이메일 또는 비밀번호가 올바르지 않습니다."); return; }
    r.push("/"); r.refresh();
  };

  const reset = async () => {
    if (!email) { setErr("이메일을 먼저 입력해 주세요."); return; }
    setBusy(true); setErr("");
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/login` });
    setBusy(false);
    setMsg(error ? `발송 실패: ${error.message}` : "비밀번호 재설정 메일을 보냈습니다. 메일의 링크를 열어 주세요.");
  };

  const setPassword = async (e) => {
    e.preventDefault();
    if (pw.length < 8) { setErr("8자 이상 입력해 주세요."); return; }
    if (pw !== pw2) { setErr("비밀번호가 서로 다릅니다."); return; }
    setBusy(true); setErr("");
    const { error } = await sb.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) { setErr(`설정 실패: ${error.message}`); return; }
    r.push("/"); r.refresh();
  };

  return (
    <div className="ip" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <form onSubmit={mode === "login" ? login : setPassword} className="card" style={{ width: 360, padding: 28 }}>
        <div className="brand" style={{ padding: 0, marginBottom: 4 }}><div className="logo" style={{ color: "#fff" }}>n</div><span style={{ fontSize: 17, fontWeight: 700 }}>이음</span></div>
        <div style={{ fontSize: 9, letterSpacing: 1.3, color: "var(--ink3)", marginBottom: 22 }}>NGO PARTNERS PORTAL</div>

        {mode === "login" ? (
          <>
            <label className="lbl">이메일</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} style={{ marginBottom: 12 }} />
            <label className="lbl">비밀번호</label>
            <input type="password" required value={pw} onChange={(e) => setPw(e.target.value)} />
            {err && <div className="errmsg">{err}</div>}
            {msg && <div className="note" style={{ background: "var(--green)", color: "var(--greenT)", marginTop: 10 }}>{msg}</div>}
            <button className="b1" type="submit" disabled={busy} style={{ width: "100%", marginTop: 18 }}>{busy ? "확인 중…" : "로그인"}</button>
            <div style={{ fontSize: 11, color: "var(--ink3)", marginTop: 14, textAlign: "center" }}>
              계정은 파트너십지원부가 발급합니다. · <span className="lnk" onClick={reset}>비밀번호 재설정</span>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 12 }}>새 비밀번호를 설정해 주세요</div>
            <label className="lbl">새 비밀번호 (8자 이상)</label>
            <input type="password" required value={pw} onChange={(e) => setPw(e.target.value)} style={{ marginBottom: 12 }} />
            <label className="lbl">비밀번호 확인</label>
            <input type="password" required value={pw2} onChange={(e) => setPw2(e.target.value)} />
            {err && <div className="errmsg">{err}</div>}
            <button className="b1" type="submit" disabled={busy} style={{ width: "100%", marginTop: 18 }}>{busy ? "저장 중…" : "설정하고 시작하기"}</button>
          </>
        )}
      </form>
    </div>
  );
}
