// R2 버킷에 브라우저 직접 업로드용 CORS 를 한 번 설정. 실행: node --env-file=.env.local scripts/r2-cors.mjs
import { S3Client, PutBucketCorsCommand, CreateBucketCommand } from "@aws-sdk/client-s3";

const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET = "ieum-files" } = process.env;
if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) { console.error("R2_* 환경변수가 없습니다 (.env.local)"); process.exit(1); }

const s3 = new S3Client({ region: "auto", endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY } });

try { await s3.send(new CreateBucketCommand({ Bucket: R2_BUCKET })); console.log("버킷 생성:", R2_BUCKET); }
catch (e) { if (!/BucketAlreadyOwnedByYou|BucketAlreadyExists/.test(e.name)) throw e; console.log("버킷 있음:", R2_BUCKET); }

await s3.send(new PutBucketCorsCommand({ Bucket: R2_BUCKET, CORSConfiguration: { CORSRules: [{
  AllowedOrigins: ["https://ieum-portal.vercel.app", "http://localhost:3000"],
  AllowedMethods: ["GET", "PUT"], AllowedHeaders: ["*"], MaxAgeSeconds: 3600,
}] } }));
console.log("CORS 설정 완료");
