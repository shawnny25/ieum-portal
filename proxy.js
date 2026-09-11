import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

// 세션 토큰 갱신 (Supabase SSR 권장 패턴)
export async function proxy(request) {
  let res = NextResponse.next({ request });
  const s = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        res = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });
  const { data: { user } } = await s.auth.getUser();
  if (!user && request.nextUrl.pathname !== "/login") return NextResponse.redirect(new URL("/login", request.url));
  return res;
}
export const config = { matcher: ["/((?!_next|favicon.ico|api).*)"] };
