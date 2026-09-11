-- 이음 포털 스키마. Supabase SQL Editor 에 붙여넣고 실행.

-- ───────── 테이블 ─────────
create table orgs (
  id serial primary key,
  name text not null,
  picked int not null,                      -- 선발연도 (이용 3년: picked ~ picked+2)
  manager_name text not null default '',
  manager_title text not null default '',
  manager_email text not null default ''
);

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  role text not null check (role in ('admin','org','expert')),
  org_id int references orgs on delete set null,
  name text not null default '',
  title text not null default '',
  email text not null default ''
);

create table submissions (
  org_id int primary key references orgs on delete cascade,
  status text not null default 'none' check (status in ('none','submitted','reviewing','revision','approved')),
  due_fix date
);

create table versions (
  id bigserial primary key,
  org_id int not null references orgs on delete cascade,
  no int not null,
  at timestamptz not null default now(),
  note text not null default '',
  files jsonb not null default '[]',        -- [{n, s, path}]
  final boolean not null default false,
  unique (org_id, no)
);

create table feedbacks (
  id bigserial primary key,
  org_id int not null references orgs on delete cascade,
  v int not null,
  at timestamptz not null default now(),
  author text not null,
  severity text not null check (severity in ('req','info')),
  content text not null,
  reply text
);

create table avail (
  org_id int references orgs on delete cascade,
  type text not null,
  date date not null,
  primary key (org_id, type, date)
);

create table confirms (
  org_id int references orgs on delete cascade,
  type text not null,
  date date not null,
  zoom text not null default '',
  mailed_at timestamptz,
  mail_failed boolean not null default false,
  primary key (org_id, type)
);

create table pre (
  org_id int primary key references orgs on delete cascade,
  rate text not null default '',
  progress text not null default '',
  country text not null default '',
  ask text not null default '',
  at timestamptz not null default now()
);

create table budgets (
  id bigserial primary key,
  org_id int not null references orgs on delete cascade,
  round int, date text, doc_no text, level text, item text,
  before_basis text, before_amt bigint, after_basis text, after_amt bigint,
  reason text, new_item boolean default false, cross_item boolean default false, plan boolean default false
);

create table docs (
  id bigserial primary key,
  org_id int not null references orgs on delete cascade,
  kind text not null check (kind in ('budget','project')),
  name text not null, size numeric not null default 0, path text not null,
  at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending','approved')),
  reason text not null default '',
  approved_by text, approved_at timestamptz, memo text
);

create table reports (
  id bigserial primary key,
  expert_id uuid references profiles on delete set null,
  type text not null,
  org_id int references orgs on delete set null,
  name text not null, size numeric not null default 0, path text not null,
  at timestamptz not null default now()
);

create table alerts (
  id bigserial primary key,
  org_id int not null references orgs on delete cascade,
  text text not null,
  at timestamptz not null default now(),
  read boolean not null default false
);

create table logs (
  id bigserial primary key,
  at timestamptz not null default now(),
  who text not null, action text not null, target text not null default ''
);

create table roadmap (
  id bigserial primary key,
  year int not null check (year between 1 and 3),
  m int not null check (m between 1 and 12),
  "when" text not null default '',
  title text not null,
  cat text not null default 'etc'
);

-- ───────── 권한 헬퍼 ─────────
create function my_role() returns text language sql stable security definer set search_path = public as
  $$ select role from profiles where id = auth.uid() $$;
create function my_org() returns int language sql stable security definer set search_path = public as
  $$ select org_id from profiles where id = auth.uid() $$;
create function org_active(oid int) returns boolean language sql stable security definer set search_path = public as
  $$ select extract(year from now()) <= picked + 2 from orgs where id = oid $$;
create function is_admin() returns boolean language sql stable as $$ select my_role() = 'admin' $$;
create function is_expert() returns boolean language sql stable as $$ select my_role() = 'expert' $$;
-- 기관 본인 + 이용기간 내 (3년 경과 차단은 여기서 서버 측 강제)
create function is_my_org(oid int) returns boolean language sql stable as
  $$ select my_role() = 'org' and my_org() = oid and org_active(oid) $$;

-- ───────── RLS ─────────
alter table orgs enable row level security;
alter table profiles enable row level security;
alter table submissions enable row level security;
alter table versions enable row level security;
alter table feedbacks enable row level security;
alter table avail enable row level security;
alter table confirms enable row level security;
alter table pre enable row level security;
alter table budgets enable row level security;
alter table docs enable row level security;
alter table reports enable row level security;
alter table alerts enable row level security;
alter table logs enable row level security;
alter table roadmap enable row level security;

-- 관리자: 전부
create policy adm on orgs        for all to authenticated using (is_admin()) with check (is_admin());
create policy adm on profiles    for all to authenticated using (is_admin()) with check (is_admin());
create policy adm on submissions for all to authenticated using (is_admin()) with check (is_admin());
create policy adm on versions    for all to authenticated using (is_admin()) with check (is_admin());
create policy adm on feedbacks   for all to authenticated using (is_admin()) with check (is_admin());
create policy adm on avail       for all to authenticated using (is_admin()) with check (is_admin());
create policy adm on confirms    for all to authenticated using (is_admin()) with check (is_admin());
create policy adm on pre         for all to authenticated using (is_admin()) with check (is_admin());
create policy adm on budgets     for all to authenticated using (is_admin()) with check (is_admin());
create policy adm on docs        for all to authenticated using (is_admin()) with check (is_admin());
create policy adm on reports     for all to authenticated using (is_admin()) with check (is_admin());
create policy adm on alerts      for all to authenticated using (is_admin()) with check (is_admin());
create policy adm on logs        for all to authenticated using (is_admin()) with check (is_admin());
create policy adm on roadmap     for all to authenticated using (is_admin()) with check (is_admin());

-- 모두 읽기
create policy all_read on orgs    for select to authenticated using (true);
create policy all_read on roadmap for select to authenticated using (true);
create policy own_read on profiles for select to authenticated using (id = auth.uid());
create policy all_ins  on logs    for insert to authenticated with check (true);   -- 삭제·수정 정책 없음 = 불변

-- 기관
create policy org_upd on orgs for update to authenticated using (is_my_org(id)) with check (is_my_org(id));
create policy org_rw on submissions for all to authenticated using (is_my_org(org_id)) with check (is_my_org(org_id) and status = 'submitted');
create policy org_sel on versions  for select to authenticated using (is_my_org(org_id));
create policy org_ins on versions  for insert to authenticated with check (is_my_org(org_id));
create policy org_sel on feedbacks for select to authenticated using (is_my_org(org_id));
create policy org_upd on feedbacks for update to authenticated using (is_my_org(org_id)) with check (is_my_org(org_id));
create policy org_rw  on avail     for all to authenticated using (is_my_org(org_id)) with check (is_my_org(org_id));
create policy org_sel on confirms  for select to authenticated using (is_my_org(org_id));
create policy org_rw  on pre       for all to authenticated using (is_my_org(org_id)) with check (is_my_org(org_id));
create policy org_rw  on budgets   for all to authenticated using (is_my_org(org_id)) with check (is_my_org(org_id));
create policy org_sel on docs      for select to authenticated using (is_my_org(org_id));
create policy org_ins on docs      for insert to authenticated with check (is_my_org(org_id) and status = 'pending');
create policy org_sel on alerts    for select to authenticated using (is_my_org(org_id));
create policy org_upd on alerts    for update to authenticated using (is_my_org(org_id)) with check (is_my_org(org_id));

-- 전문가
create policy exp_sel on confirms for select to authenticated using (is_expert());
create policy exp_upd on confirms for update to authenticated using (is_expert()) with check (is_expert());
create policy exp_sel on pre      for select to authenticated using (is_expert());
create policy exp_sel on reports  for select to authenticated using (is_expert() and expert_id = auth.uid());
create policy exp_ins on reports  for insert to authenticated with check (is_expert() and expert_id = auth.uid());

-- 열 단위 제한: 기관은 feedbacks.reply 만, 전문가는 confirms.zoom 만 수정 가능
create function guard_cols() returns trigger language plpgsql as $$
begin
  if tg_table_name = 'feedbacks' and my_role() = 'org' then
    if to_jsonb(new) - 'reply' <> to_jsonb(old) - 'reply' then raise exception 'reply only'; end if;
  elsif tg_table_name = 'confirms' and my_role() = 'expert' then
    if to_jsonb(new) - 'zoom' <> to_jsonb(old) - 'zoom' then raise exception 'zoom only'; end if;
  elsif tg_table_name = 'orgs' and my_role() = 'org' then
    if to_jsonb(new) - 'manager_name' - 'manager_title' - 'manager_email'
       <> to_jsonb(old) - 'manager_name' - 'manager_title' - 'manager_email' then raise exception 'manager only'; end if;
  end if;
  return new;
end $$;
create trigger guard before update on feedbacks for each row execute function guard_cols();
create trigger guard before update on confirms  for each row execute function guard_cols();
create trigger guard before update on orgs      for each row execute function guard_cols();

-- ───────── 스토리지 ─────────
insert into storage.buckets (id, name, public) values ('files', 'files', false);
-- 경로 규칙: org-{orgId}/... , expert-{uuid}/...
create policy adm on storage.objects for all to authenticated
  using (bucket_id = 'files' and is_admin()) with check (bucket_id = 'files' and is_admin());
create policy org_rw on storage.objects for all to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = 'org-' || my_org() and org_active(my_org()))
  with check (bucket_id = 'files' and (storage.foldername(name))[1] = 'org-' || my_org() and org_active(my_org()));
create policy exp_rw on storage.objects for all to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = 'expert-' || auth.uid())
  with check (bucket_id = 'files' and (storage.foldername(name))[1] = 'expert-' || auth.uid());

-- ───────── 기본 연간 일정 ─────────
insert into roadmap (year, m, "when", title, cat) values
 (1,1,'1월 3주차','사업 오리엔테이션','etc'),(1,1,'1월 4주차 – 2월 1주차','안전지침 컨설팅','consult'),
 (1,3,'3월 4주차','상반기 필수컨설팅','consult'),(1,4,'4월 2주차','선택컨설팅 신청','consult'),
 (1,7,'7월 2주차','중간결과보고 준비','report'),(1,8,'8월 1주차','국내 현장점검','monitor'),
 (1,8,'8월 4주차','2차 배분금 지원','etc'),(1,9,'9월 18일','중간보고서 제출 마감','deadline'),
 (1,9,'9월 21 – 25일','하반기 필수컨설팅','consult'),(1,10,'10월 13 – 15일','선택컨설팅','consult'),
 (1,11,'11월 2주차','1차 결과보고 (1–10월분)','report'),(1,11,'11월 4주차','연간 사업평가 및 차년도 계획 심사','monitor'),
 (1,12,'12월 2주차','연말 결과공유회','etc'),
 (2,2,'2월 2주차','2차년도 사업계획 확정','etc'),(2,3,'3월 4주차','상반기 필수컨설팅','consult'),
 (2,5,'5월 2주차','1차 현장 모니터링','monitor'),(2,6,'6월 4주차','상반기 집행 점검','report'),
 (2,9,'9월 18일','중간보고서 제출 마감','deadline'),(2,9,'9월 21 – 25일','하반기 필수컨설팅','consult'),
 (2,10,'10월 2주차','성과지표 중간 점검','monitor'),(2,11,'11월 2주차','1차 결과보고 (1–10월분)','report'),
 (2,12,'12월 2주차','연말 결과공유회','etc'),
 (3,1,'1월 4주차','최종연차 사업 착수 회의','etc'),(3,3,'3월 4주차','상반기 필수컨설팅','consult'),
 (3,6,'6월 3주차','종료 대비 정산 점검','report'),(3,9,'9월 18일','중간보고서 제출 마감','deadline'),
 (3,9,'9월 21 – 25일','하반기 필수컨설팅','consult'),(3,10,'10월 3주차','최종 현장점검','monitor'),
 (3,11,'11월 4주차','사업 종료보고 및 정산 심사','report'),(3,12,'12월 2주차','연말 결과공유회 · 성과 공유','etc');
