# 이음 · NGO 파트너스 포털

Next.js + Supabase. 관리자 / 기관 / 전문가 3종 화면.

- 서비스: https://ieum-portal.vercel.app
- Supabase 프로젝트: `ieum-portal` (ref `kcgiddadxjbjoimfzfwr`, Seoul)
- GitHub: https://github.com/shawnny25/ieum-portal (main 에 push 하면 Vercel 자동 배포)

## 0. 한 달 무료 테스트 준비 (2026-09-14)

완료: Supabase 프로젝트·스키마·스토리지, 관리자 프로필, Vercel 배포, 자동 정지 방지 크론(매일 0시), Gmail 메일 발송 경로, R2 저장소 경로, 주간 백업 워크플로.
직접 해야 하는 것 세 가지. 전부 명령 한 줄에 값 붙여넣기.

1. **서비스 키** — 계정 발급 메뉴에 필요. Supabase → Project Settings → API Keys → Secret keys → default 값 복사 후:
   ```bash
   npx vercel env add SUPABASE_SERVICE_ROLE_KEY production
   ```
2. **메일 발송용 Gmail** — 팀 Gmail 계정에서 [앱 비밀번호](https://myaccount.google.com/apppasswords) 발급(2단계 인증 필요) 후:
   ```bash
   npx vercel env add GMAIL_USER production
   ```
   ```bash
   npx vercel env add GMAIL_APP_PASSWORD production
   ```
3. **Supabase 인증 메일도 같은 Gmail 로** — 무료 기본 발송은 시간당 2통이라 비밀번호 재설정이 몰리면 막힌다.
   Supabase → Authentication → Emails → SMTP Settings → Enable Custom SMTP:
   Host `smtp.gmail.com`, Port `465`, User = Gmail 주소, Password = 앱 비밀번호, Sender = Gmail 주소.

세 개 넣은 뒤 `npx vercel --prod` 한 번. `.env.local` 에도 같은 값을 넣으면 로컬에서도 동작.

### 파일 저장소를 R2 로 (무료 10GB, 파일당 200MB)

키가 없으면 Supabase 저장소(1GB, 50MB)로 동작한다. 넣으면 그때부터 올리는 파일은 R2 로 간다.

1. https://dash.cloudflare.com → R2 Object Storage → **Manage R2 API Tokens → Create API token**
   권한 "Object Read & Write", 만료 없음. 생성 후 화면의 **Access Key ID / Secret Access Key** 와, R2 개요 화면 우측의 **Account ID** 를 복사.
2. `.env.local` 의 `R2_*` 네 줄에 붙여넣고 `NEXT_PUBLIC_R2=1` 추가.
3. 버킷 생성 + 브라우저 업로드 허용(CORS) 한 번:
   ```bash
   node --env-file=.env.local scripts/r2-cors.mjs
   ```
4. Vercel 에도 같은 다섯 개 등록 (`npx vercel env add R2_ACCOUNT_ID production` 식으로 반복) 후 `npx vercel --prod`.

### 주간 DB 백업 (GitHub Actions, 무료)

매주 월요일 새벽 3시에 DB 전체를 덤프해 GitHub 아티팩트로 90일 보관. `.github/workflows/backup.yml`.

1. Supabase → 상단 **Connect** → Direct connection 문자열 복사 (비밀번호는 프로젝트 생성 때 것. 잊었으면 Project Settings → Database → Reset database password)
2. https://github.com/shawnny25/ieum-portal/settings/secrets/actions → **New repository secret** → 이름 `SUPABASE_DB_URL`, 값은 위 문자열
3. Actions 탭 → weekly-db-backup → **Run workflow** 로 한 번 돌려서 아티팩트가 생기는지 확인

복원은 SQL Editor 에 덤프 파일 내용을 붙여넣으면 된다. R2 파일 자체는 백업하지 않는다(R2 는 자체 내구성 보장, 실수 삭제 방지는 버킷의 삭제 권한을 관리자만 갖는 것으로 대체).

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
