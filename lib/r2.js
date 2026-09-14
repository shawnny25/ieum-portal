import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Cloudflare R2 (S3 호환). 서버 전용. 키가 없으면 configured=false → 클라이언트는 Supabase 저장소로 폴백.
export const r2Configured = () => !!(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY);

const client = () => new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});
const Bucket = () => process.env.R2_BUCKET || "ieum-files";

export const putUrl = (Key, ContentType) => getSignedUrl(client(), new PutObjectCommand({ Bucket: Bucket(), Key, ContentType }), { expiresIn: 600 });
export const getUrl = (Key, filename) => getSignedUrl(client(),
  new GetObjectCommand({ Bucket: Bucket(), Key, ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(filename)}` }),
  { expiresIn: 60 });
