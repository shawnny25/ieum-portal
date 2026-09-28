import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, CopyObjectCommand, CreateBucketCommand } from "@aws-sdk/client-s3";
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

// 파일 백업: 원본 버킷에 있고 백업 버킷(<원본>-backup)에 없는 객체만 서버 측 복사. 백업 쪽은 지우지 않는다(원본에서 지워져도 남음).
// ponytail: 같은 Cloudflare 계정 안의 사본. 계정 자체 사고까지 대비하려면 외부(로컬·다른 클라우드)로 주기적 내려받기 추가.
export async function backupR2() {
  const s3 = client(), src = Bucket(), dst = `${src}-backup`;
  try { await s3.send(new CreateBucketCommand({ Bucket: dst })); }
  catch (e) { if (!/BucketAlreadyOwnedByYou|BucketAlreadyExists/.test(e.name)) throw e; }
  const keys = async (b) => {
    const out = new Set(); let token;
    do {
      const r = await s3.send(new ListObjectsV2Command({ Bucket: b, ContinuationToken: token }));
      (r.Contents || []).forEach((o) => out.add(o.Key));
      token = r.NextContinuationToken;
    } while (token);
    return out;
  };
  const [have, done] = await Promise.all([keys(src), keys(dst)]);
  const todo = [...have].filter((k) => !done.has(k));
  for (const k of todo)   // 파일명에 한글이 있어 경로 조각별로 인코딩
    await s3.send(new CopyObjectCommand({ Bucket: dst, Key: k, CopySource: `${src}/${k.split("/").map(encodeURIComponent).join("/")}` }));
  return { bucket: dst, total: have.size, copied: todo.length };
}
