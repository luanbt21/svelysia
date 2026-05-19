import { env } from "$lib/server/env";
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type PutObjectCommandInput,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { logger } from "./logger";

export const s3Client = new S3Client({
  endpoint: env.S3_ENDPOINT,
  region: env.AWS_REGION,
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
});

export async function createBucket(bucketName: string) {
  try {
    const command = new CreateBucketCommand({
      Bucket: bucketName,
    });

    const response = await s3Client.send(command);
    logger.info(response, "Bucket created successfully");
    return response;
  } catch (error) {
    // @ts-expect-error: error when bucket already exists
    if (error.name === "BucketAlreadyOwnedByYou") {
      logger.info("Bucket already exists");
    } else {
      logger.error(error, "Error creating bucket:");
      throw error;
    }
  }
}

export async function uploadFile(
  Bucket: string,
  Key: string,
  Body: PutObjectCommandInput["Body"],
  ContentType = "application/octet-stream",
) {
  try {
    const command = new PutObjectCommand({ Bucket, Key, Body, ContentType });

    const response = await s3Client.send(command);
    logger.info(response, "File uploaded successfully");
    return response;
  } catch (error) {
    logger.error(error, "Error uploading file");
    throw error;
  }
}

export async function getDownloadUrl(Bucket: string, Key: string, expiresIn = 3600) {
  try {
    const command = new GetObjectCommand({ Bucket, Key });
    const url = await getSignedUrl(s3Client, command, { expiresIn });
    return url;
  } catch (error) {
    logger.error(error, "Error generating download URL");
    throw error;
  }
}

export async function getUploadUrl(Bucket: string, Key: string, expiresIn = 3600) {
  try {
    const command = new PutObjectCommand({ Bucket, Key });
    const url = await getSignedUrl(s3Client, command, { expiresIn });
    logger.info({ url }, "Upload URL");
    return url;
  } catch (error) {
    logger.error(error, "Error generating upload URL");
    throw error;
  }
}

export async function getObjectInfo<T = { width?: string; height?: string }>(
  bucket: string,
  key: string,
) {
  const command = new HeadObjectCommand({ Bucket: bucket, Key: key });
  const response = await s3Client.send(command);

  return {
    fileName: key,
    fileSize: response.ContentLength,
    contentType: response.ContentType,
    lastModified: response.LastModified,
    customMetadata: response.Metadata as T,
  };
}
