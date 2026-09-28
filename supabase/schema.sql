-- 이음 포털 스키마 — 빈 Supabase 프로젝트에 한 번에 실행하는 설치 스크립트 (현재 운영 DB 의 최종 상태).
-- 실행: Supabase → SQL Editor 에 전체를 붙여넣고 Run. 이미 테이블이 있는 DB 에는 실행하지 말 것.
-- 운영 DB 를 바꿀 때는 변경 SQL 을 운영에 실행하고, 이 파일도 같은 최종 상태로 고쳐 둔다 (변경 이력은 git 기록).

-- ───────── 테이블 ─────────
create table orgs (
  id serial primary key,
  name text not null,
  picked int not null,                      -- 선발연도 (이용 3년: picked ~ picked+2)
  manager_name text not null default '',
  manager_title text not null default '',
  manager_email text not null default '',
  budget_total bigint not null default 0,   -- 3개년 사업예산 총액
  budget_year bigint not null default 0     -- 당해년도 사업예산 총액
);

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  role text not null check (role in ('admin','org','expert')),
  org_id int references orgs on delete set null,
  name text not null default '',
  title text not null default '',
  email text not null default ''
);

-- 기관별 담당 전문가 (profiles 가 orgs 를 참조하므로 뒤에 추가)
alter table orgs add column expert_id uuid references profiles on delete set null;

create table submissions (
  org_id int references orgs on delete cascade,
  kind text not null default 'mid',          -- 보고서 종류 (settings.reports[].key)
  status text not null default 'none' check (status in ('none','submitted','reviewing','revision','approved')),
  due_fix date,
  primary key (org_id, kind)
);

create table versions (
  id bigserial primary key,
  org_id int not null references orgs on delete cascade,
  kind text not null default 'mid',
  no int not null,
  at timestamptz not null default now(),
  note text not null default '',
  files jsonb not null default '[]',        -- [{n, s, path}]
  final boolean not null default false,
  unique (org_id, kind, no)
);

create table feedbacks (
  id bigserial primary key,
  org_id int not null references orgs on delete cascade,
  kind text not null default 'mid',
  v int not null,
  at timestamptz not null default now(),
  author text not null,
  severity text not null check (severity in ('req','info')),
  content text not null,
  reply text
);

-- 기관이 고른 컨설팅 희망 일시 (rank = 희망 순위 1,2,3…)
create table avail (
  org_id int references orgs on delete cascade,
  type text not null,
  date date not null,
  time text not null default '',
  rank int,
  primary key (org_id, type, date, time)
);

-- 확정된 컨설팅 일정
create table confirms (
  org_id int references orgs on delete cascade,
  type text not null,
  date date not null,
  time text not null default '',
  zoom text not null default '',
  mailed_at timestamptz,
  mail_failed boolean not null default false,
  expert_id uuid references profiles on delete set null,
  primary key (org_id, type)
);

-- 컨설팅 회차별 사전 정보
create table pre (
  org_id int references orgs on delete cascade,
  type text not null default 'h2',
  rate text not null default '',
  progress text not null default '',
  country text not null default '',
  ask text not null default '',
  at timestamptz not null default now(),
  primary key (org_id, type)
);

create table budgets (
  id bigserial primary key,
  org_id int not null references orgs on delete cascade,
  round int, date text, doc_no text, level text, item text,
  item_to text not null default '',          -- 항목 전환 시 전환 대상 항목
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
  amount bigint not null default 0,          -- 변경 금액 (외부 승인분)
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

-- 사업 설정 (관리자 화면에서 편집, 한 행 jsonb)
create table settings (
  id int primary key default 1 check (id = 1),
  data jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

-- 흐름: 관리자가 회차별 후보 일시 등록 → 전문가가 가능 일시 체크(expert_avail)
--       → 관리자가 기관별 담당 전문가 배정(orgs.expert_id) → 기관이 담당 전문가 가능 일시 중 희망 순위 선택(avail)
--       → 관리자 확정(confirms)
create table expert_avail (
  expert_id uuid not null references profiles on delete cascade,
  type text not null,
  date date not null,
  time text not null default '',
  primary key (expert_id, type, date, time)
);

-- 전문가가 후보 일시 외에 주관식으로 적는 추가 가능 시간
create table expert_notes (
  expert_id uuid not null references profiles on delete cascade,
  type text not null,
  note text not null default '',
  at timestamptz not null default now(),
  primary key (expert_id, type)
);

-- 선택컨설팅 신청서
create table consult_apps (
  org_id int references orgs on delete cascade,
  type text not null,
  data jsonb not null default '{}',
  expert_pref text not null default '',
  at timestamptz not null default now(),
  primary key (org_id, type)
);

-- ───────── 권한 헬퍼 ─────────
-- security definer 함수는 RLS 를 거치지 않고 읽는다 → 정책 안에서 써도 재귀가 생기지 않는다.
create function my_role() returns text language sql stable security definer set search_path = public as
  $$ select role from profiles where id = auth.uid() $$;
create function my_org() returns int language sql stable security definer set search_path = public as
  $$ select org_id from profiles where id = auth.uid() $$;
create function org_active(oid int) returns boolean language sql stable security definer set search_path = public as
  $$ select extract(year from now()) <= picked + 2 from orgs where id = oid $$;
create function my_expert() returns uuid language sql stable security definer set search_path = public as
  $$ select expert_id from orgs where id = my_org() $$;
create function org_expert(oid int) returns uuid language sql stable security definer set search_path = public as
  $$ select expert_id from orgs where id = oid $$;
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
alter table settings enable row level security;
alter table expert_avail enable row level security;
alter table expert_notes enable row level security;
alter table consult_apps enable row level security;

-- 관리자: 전부
create policy adm on orgs         for all to authenticated using (is_admin()) with check (is_admin());
create policy adm on profiles     for all to authenticated using (is_admin()) with check (is_admin());
create policy adm on submissions  for all to authenticated using (is_admin()) with check (is_admin());
create policy adm on versions     for all to authenticated using (is_admin()) with check (is_admin());
create policy adm on feedbacks    for all to authenticated using (is_admin()) with check (is_admin());
create policy adm on avail        for all to authenticated using (is_admin()) with check (is_admin());
create policy adm on confirms     for all to authenticated using (is_admin()) with check (is_admin());
create policy adm on pre          for all to authenticated using (is_admin()) with check (is_admin());
create policy adm on budgets      for all to authenticated using (is_admin()) with check (is_admin());
create policy adm on docs         for all to authenticated using (is_admin()) with check (is_admin());
create policy adm on reports      for all to authenticated using (is_admin()) with check (is_admin());
create policy adm on alerts       for all to authenticated using (is_admin()) with check (is_admin());
create policy adm on logs         for all to authenticated using (is_admin()) with check (is_admin());
create policy adm on roadmap      for all to authenticated using (is_admin()) with check (is_admin());
create policy adm on settings     for all to authenticated using (is_admin()) with check (is_admin());
create policy adm on expert_avail for all to authenticated using (is_admin()) with check (is_admin());
create policy adm on expert_notes for all to authenticated using (is_admin()) with check (is_admin());
create policy adm on consult_apps for all to authenticated using (is_admin()) with check (is_admin());

-- 공통
create policy all_read on roadmap  for select to authenticated using (true);
create policy all_read on settings for select to authenticated using (true);
create policy own_read on profiles for select to authenticated using (id = auth.uid());
create policy all_ins  on logs     for insert to authenticated with check (true);   -- 삭제·수정 정책 없음 = 불변

-- 기관 (orgs 는 자기 기관만 — 이용 종료 기관도 차단 안내 화면을 위해 읽기 허용)
create policy org_sel on orgs         for select to authenticated using (my_role() = 'org' and my_org() = id);
create policy org_upd on orgs         for update to authenticated using (is_my_org(id)) with check (is_my_org(id));
create policy org_expert on profiles  for select to authenticated using (my_role() = 'org' and id = my_expert());  -- 담당 전문가 한 명만
create policy org_rw  on submissions  for all to authenticated using (is_my_org(org_id)) with check (is_my_org(org_id) and status = 'submitted');
create policy org_sel on versions     for select to authenticated using (is_my_org(org_id));
create policy org_ins on versions     for insert to authenticated with check (is_my_org(org_id));
create policy org_sel on feedbacks    for select to authenticated using (is_my_org(org_id));
create policy org_upd on feedbacks    for update to authenticated using (is_my_org(org_id)) with check (is_my_org(org_id));
create policy org_rw  on avail        for all to authenticated using (is_my_org(org_id)) with check (is_my_org(org_id));
create policy org_sel on confirms     for select to authenticated using (is_my_org(org_id));
create policy org_rw  on pre          for all to authenticated using (is_my_org(org_id)) with check (is_my_org(org_id));
create policy org_rw  on budgets      for all to authenticated using (is_my_org(org_id)) with check (is_my_org(org_id));
create policy org_sel on docs         for select to authenticated using (is_my_org(org_id));
create policy org_ins on docs         for insert to authenticated with check (is_my_org(org_id) and status = 'pending');
create policy org_sel on alerts       for select to authenticated using (is_my_org(org_id));
create policy org_upd on alerts       for update to authenticated using (is_my_org(org_id)) with check (is_my_org(org_id));
create policy org_rw  on consult_apps for all to authenticated using (is_my_org(org_id)) with check (is_my_org(org_id));
create policy org_sel on expert_avail for select to authenticated
  using (my_role() = 'org' and org_active(my_org()) and expert_id = my_expert());
-- 같은 담당 전문가를 공유하는 다른 기관의 희망 순위·확정 일정 (선점 표시용). orgs 는 못 읽으므로 org_expert() 로 확인.
create policy org_sel_shared on avail for select to authenticated
  using (my_role() = 'org' and org_active(my_org()) and my_expert() is not null and org_expert(avail.org_id) = my_expert());
create policy org_sel_shared on confirms for select to authenticated
  using (my_role() = 'org' and org_active(my_org()) and my_expert() is not null and expert_id = my_expert());

-- 전문가 (배정되었거나 확정 일정이 있는 기관만)
create policy exp_sel on orgs for select to authenticated using (is_expert() and (expert_id = auth.uid()
  or exists (select 1 from confirms c where c.org_id = orgs.id and c.expert_id = auth.uid())));
create policy exp_sel on confirms for select to authenticated using (is_expert() and expert_id = auth.uid());
create policy exp_sel on pre for select to authenticated
  using (is_expert() and exists (select 1 from confirms c where c.org_id = pre.org_id and c.expert_id = auth.uid()));
create policy exp_sel on consult_apps for select to authenticated using (is_expert() and exists (
  select 1 from confirms c where c.org_id = consult_apps.org_id and c.type = consult_apps.type and c.expert_id = auth.uid()));
create policy exp_sel on reports for select to authenticated using (is_expert() and expert_id = auth.uid());
create policy exp_ins on reports for insert to authenticated with check (is_expert() and expert_id = auth.uid());
create policy exp_rw on expert_avail for all to authenticated
  using (is_expert() and expert_id = auth.uid()) with check (is_expert() and expert_id = auth.uid());
create policy exp_rw on expert_notes for all to authenticated
  using (is_expert() and expert_id = auth.uid()) with check (is_expert() and expert_id = auth.uid());

-- ───────── 열 단위 제한 트리거 ─────────
-- 기관은 feedbacks.reply 와 orgs 담당자 정보만, 전문가는 confirms.zoom 만 수정 가능.
-- search_path 고정: 계정 삭제(auth 스키마에서 실행) 연쇄로 이 트리거가 돌 때 my_role() 을 찾을 수 있어야 한다.
create function guard_cols() returns trigger language plpgsql set search_path = public as $$
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

-- ───────── 스토리지 (R2 미설정 시 폴백 저장소. DB 백업용 backups 버킷은 크론이 만든다) ─────────
insert into storage.buckets (id, name, public) values ('files', 'files', false) on conflict (id) do nothing;
-- 경로 규칙: org-{orgId}/... , expert-{uuid}/...
create policy adm on storage.objects for all to authenticated
  using (bucket_id = 'files' and is_admin()) with check (bucket_id = 'files' and is_admin());
create policy org_rw on storage.objects for all to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = 'org-' || my_org() and org_active(my_org()))
  with check (bucket_id = 'files' and (storage.foldername(name))[1] = 'org-' || my_org() and org_active(my_org()));
create policy exp_rw on storage.objects for all to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = 'expert-' || auth.uid())
  with check (bucket_id = 'files' and (storage.foldername(name))[1] = 'expert-' || auth.uid());

-- ───────── 초기 데이터 ─────────
insert into settings (id) values (1);

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
