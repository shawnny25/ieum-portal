# 이음 · NGO 파트너스 포털

Next.js + Supabase. 관리자 / 기관 / 전문가 3종 화면.

- 서비스: https://ieum-portal.vercel.app
- Supabase 프로젝트: `ieum-portal` (ref `kcgiddadxjbjoimfzfwr`, Seoul)
- GitHub: https://github.com/shawnny25/ieum-portal (main 에 push 하면 Vercel 자동 배포)

## 0. 현재 상태 (2026-09-12 자동 구축 결과)

완료: Supabase 프로젝트·스키마·스토리지, 관리자 프로필(sionlee0825@gmail.com), Vercel 배포, 공개 env 2개.
남은 것은 아래 두 가지뿐.

1. **비밀번호 설정** — 초대 메일이 sionlee0825@gmail.com 으로 발송됨. 만료됐으면 https://ieum-portal.vercel.app/login 에서 이메일 입력 후 "비밀번호 재설정" 클릭.
2. **SUPABASE_SERVICE_ROLE_KEY 등록** — 계정 발급 메뉴에 필요. Supabase → Project Settings → API Keys → Secret keys → default 의 값을 복사해서:
   ```bash
   npx vercel env add SUPABASE_SERVICE_ROLE_KEY production
   ```
   (붙여넣고 Enter) 그리고 `.env.local` 의 같은 줄에도 붙여넣기. 그 뒤 `npx vercel --prod`.

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
