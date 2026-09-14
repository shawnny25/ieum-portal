# 이음 · NGO 파트너스 포털

Next.js + Supabase. 관리자 / 기관 / 전문가 3종 화면.

- 서비스: https://ieum-portal.vercel.app
- Supabase 프로젝트: `ieum-portal` (ref `kcgiddadxjbjoimfzfwr`, Seoul)
- GitHub: https://github.com/shawnny25/ieum-portal (main 에 push 하면 Vercel 자동 배포)

## 0. 현재 상태 (2026-09-14)

완료: Supabase 프로젝트·스키마·스토리지, 관리자 프로필, Vercel 배포, 서비스 키 등록, 자동 정지 방지 + 일일 백업 크론, 권한 모델 E2E 검증(`scripts/e2e-check.mjs` 통과).

남은 것 (비밀값이라 직접):

1. **메일 발송용 Gmail** — 팀 Gmail 계정에서 [앱 비밀번호](https://myaccount.google.com/apppasswords) 발급(2단계 인증 필요) 후:
   ```bash
   npx vercel env add GMAIL_USER production
   ```
   ```bash
   npx vercel env add GMAIL_APP_PASSWORD production
   ```
   그리고 Supabase → Authentication → Emails → SMTP Settings 에도 같은 값 (Host `smtp.gmail.com`, Port `465`).
   없으면: Zoom 안내 메일은 "발송 실패"로 남고, 비밀번호 재설정 메일은 시간당 2통 제한.
2. **R2 (선택)** — Cloudflare 이메일 확인 후 R2 → Manage API Tokens → Create (Object Read & Write). Access Key ID / Secret 을 `.env.local` 의 `R2_*` 에 넣고 `NEXT_PUBLIC_R2=1`, 그 다음:
   ```bash
   node --env-file=.env.local scripts/r2-cors.mjs
   ```
   Vercel 에도 같은 다섯 개 등록 후 `npx vercel --prod`. 안 넣으면 Supabase 저장소(1GB, 50MB)로 동작.

### 백업

매일 0시 `/api/cron` 이 DB 전체와 계정 목록을 JSON 으로 덤프해 스토리지 `backups` 버킷에 저장하고 60일 지난 것을 지운다.
복원: Supabase → Storage → backups 에서 파일명 확인 후
```bash
node --env-file=.env.local scripts/restore.mjs ieum-2026-09-14.json
```

### 검증

권한 격리(기관은 자기 데이터만, 만료 기관 차단, 스토리지 폴더 격리)는 임시 계정으로 실제 호출해 확인한다. 실행 후 임시 데이터는 자동 삭제.
```bash
node --env-file=.env.local scripts/e2e-check.mjs
```

## 1. Supabase 설정 (한 번만)

1. https://supabase.com/dashboard → **New project** (리전: Northeast Asia (Seoul))
2. 좌측 **SQL Editor** → `supabase/schema.sql` 내용 전체 붙여넣고 **Run**
3. 좌측 **Authentication → Users → Add user → Create new user**
   - 본인 이메일 + 비밀번호 입력, **Auto Confirm User** 체크
4. 다시 **SQL Editor** 에서 본인을 관리자로 등록 (이메일만 바꿔서 실행):
   ```sql
   insert into profiles (id, role, name, title, email)
   select id, 'admin', '홍길동', '사업운영팀', email from auth.users where email = 'sionlee0825@gmail.com';
   ```
5. **Project Settings → API** 에서 세 값 복사:
   - Project URL
   - anon public key
   - service_role key (비밀. 서버에서만 사용)

## 2. 로컬 실행

```bash
cp .env.local.example .env.local
```
`.env.local` 에 위 세 값을 채운 뒤:
```bash
npm run dev
```
http://localhost:3000 → 관리자로 로그인 → **계정 관리** 메뉴에서 기관 추가 · 나머지 계정 발급.

## 3. Vercel 배포

1. GitHub 에 push
2. https://vercel.com/new → 저장소 import
3. **Environment Variables** 에 `.env.local` 의 값 그대로 등록
4. Deploy

## 4. 메일 발송 (Resend, 나중에)

1. https://resend.com 가입 → API Key 발급
2. Vercel 환경변수에 `RESEND_API_KEY`, `MAIL_FROM` 추가
3. 도메인 인증 전에는 `MAIL_FROM` 을 비워두면 `onboarding@resend.dev` 로 발송됨 (가입 이메일로만 수신 가능)

키가 없으면 Zoom 링크는 저장되고 메일만 "발송 실패"로 남는다. 키 등록 후 컨설팅 일정 화면에서 **재시도** 누르면 발송.

## 구조

| 경로 | 역할 |
|---|---|
| `supabase/schema.sql` | 테이블 · RLS(역할별 접근 제한) · 스토리지 정책 · 기본 연간 일정 |
| `lib/config.js` | 사업명, 마감일, 컨설팅 일자 등 연도별로 바꾸는 상수 |
| `lib/db.js` | DB → 화면 데이터 조립, 파일 업로드/다운로드 |
| `components/Portal.jsx` | 전체 화면 |
| `app/api/admin/users` | 계정 발급/삭제 (service role) |
| `app/api/zoom` | Zoom 링크 저장 + 안내 메일 |

## 알아둘 것

- **파일 크기 상한 50MB** (Supabase 무료 플랜). Pro 플랜($25/월)이면 `lib/config.js` 의 `MAX_MB` 를 200 으로.
- **3년 이용기간 만료**는 DB(RLS)에서 막는다. 만료 기관은 로그인은 되지만 아무 데이터도 못 본다.
- 공지사항은 `lib/config.js` 의 `NOTICES` 상수. 자주 바뀌면 테이블로 옮길 것.
- 활동 로그는 삭제·수정 정책이 없어 DB 에서 직접 지우지 않는 한 남는다.
