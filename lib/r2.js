import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function r2Config() {
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME;

  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error("R2 configuration missing");
  }

  return { endpoint, accessKeyId, secretAccessKey, bucket };
}

function client() {
  const cfg = r2Config();
  return new S3Client({
    region: "auto",
    endpoint: cfg.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  });
}

export async function createPresignedUpload({ key, contentType }) {
  const cfg = r2Config();
  const command = new PutObjectCommand({
    Bucket: cfg.bucket,
    Key: key,
    ContentType: contentType || "application/octet-stream",
  });

  const url = await getSignedUrl(client(), command, { expiresIn: 60 * 60 });
  return { url, key, bucket: cfg.bucket };
}

export async function getR2Object(key) {
  const cfg = r2Config();
  const response = await client().send(new GetObjectCommand({ Bucket: cfg.bucket, Key: key }));
  if (!response.Body) throw new Error(`R2 object has no body: ${key}`);
  const bytes = await response.Body.transformToByteArray();
  return {
    buffer: Buffer.from(bytes),
    contentType: response.ContentType || "application/octet-stream",
  };
}

export async function putR2Object({ key, buffer, contentType }) {
  const cfg = r2Config();
  await client().send(new PutObjectCommand({
    Bucket: cfg.bucket,
    Key: key,
    Body: buffer,
    ContentType: contentType || "application/octet-stream",
  }));
  return { key };
}

export async function deleteR2Object(key) {
  const cfg = r2Config();
  await client().send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }));
  return { key };
}
