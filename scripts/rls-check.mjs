import { createClient } from "@supabase/supabase-js";
const sb = createClient("https://kcgiddadxjbjoimfzfwr.supabase.co", "sb_publishable_j1yCv449zPTxACK_eWOjRg_Ww1IlLcj");
for (const t of ["roadmap", "orgs", "profiles", "logs"]) {
  const { data, error } = await sb.from(t).select("*").limit(3);
  console.log(t, error ? "ERR " + error.message : `rows=${data.length}`);
}
const { error: e2 } = await sb.from("logs").insert({ who: "anon", action: "x" });
console.log("anon insert logs:", e2 ? "blocked (" + e2.message + ")" : "ALLOWED!!");
const { data: b } = await sb.storage.from("files").list();
console.log("anon storage list:", b);
