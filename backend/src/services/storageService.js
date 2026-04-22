import fs from "fs";
import path from "path";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { fileURLToPath } from "url";
import { env } from "../config/env.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const storageRoot = path.resolve(__dirname, "../../storage");

fs.mkdirSync(storageRoot, { recursive: true });

const s3Configured = Boolean(env.s3BucketName && env.s3AccessKeyId && env.s3SecretAccessKey);

const s3Client = s3Configured
  ? new S3Client({
      region: env.awsRegion,
      credentials: {
        accessKeyId: env.s3AccessKeyId,
        secretAccessKey: env.s3SecretAccessKey,
        sessionToken: env.s3SessionToken || undefined
      }
    })
  : null;

export async function uploadArtifact(localPath, { folder, fileName, contentType }) {
  const safeFolder = folder.replace(/[\\/]+/g, "/");
  const objectKey = `${safeFolder}/${fileName}`;

  if (s3Client) {
    const body = fs.readFileSync(localPath);
    await s3Client.send(
      new PutObjectCommand({
        Bucket: env.s3BucketName,
        Key: objectKey,
        Body: body,
        ContentType: contentType
      })
    );

    return {
      provider: "s3",
      key: objectKey,
      url: `https://${env.s3BucketName}.s3.${env.awsRegion}.amazonaws.com/${objectKey}`,
      localPath: null
    };
  }

  const destinationDir = path.join(storageRoot, safeFolder);
  fs.mkdirSync(destinationDir, { recursive: true });
  const destinationPath = path.join(destinationDir, fileName);
  fs.copyFileSync(localPath, destinationPath);

  return {
    provider: "local",
    key: path.relative(storageRoot, destinationPath),
    url: null,
    localPath: destinationPath
  };
}

export async function getStoredArtifactBuffer({ provider, key, localPath }) {
  if (provider === "s3" && s3Client) {
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: env.s3BucketName,
        Key: key
      })
    );

    return Buffer.from(await response.Body.transformToByteArray());
  }

  return fs.readFileSync(localPath || path.join(storageRoot, key));
}

export async function deleteStoredArtifact({ provider, key, localPath }) {
  if (provider === "s3" && s3Client && key) {
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: env.s3BucketName,
        Key: key
      })
    );
    return;
  }

  const targetPath = localPath || (key ? path.join(storageRoot, key) : null);
  if (targetPath && fs.existsSync(targetPath)) {
    fs.unlinkSync(targetPath);
  }
}
