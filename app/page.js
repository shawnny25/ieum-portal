import { redirect } from "next/navigation";
import { me } from "@/lib/supabase/server";
import Portal from "@/components/Portal";

export default async function Home() {
  const profile = await me();
  if (!profile) redirect("/login");
  return <Portal profile={profile} />;
}
