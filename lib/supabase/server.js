import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export async function serverClient() {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => { try { list.forEach(({ name, value, options }) => store.set(name, value, options)); } catch {} },
    },
  });
}

// 서비스 롤: 계정 생성 전용. 절대 클라이언트로 내보내지 말 것.
export const adminClient = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// 현재 로그인 사용자 + profile. 없으면 null.
export async function me() {
  const s = await serverClient();
  const { data: { user } } = await s.auth.getUser();
  if (!user) return null;
  const { data: profile } = await s.from("profiles").select("*").eq("id", user.id).single();
  return profile ? { ...profile, email: profile.email || user.email } : null;
}
