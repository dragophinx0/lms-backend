const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

// Initialize S3 client for Cloudflare R2
const s3Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const bucketName = process.env.R2_BUCKET_NAME;

/**
 * Upload a file to R2
 * @param {Buffer} fileBuffer - The file buffer
 * @param {string} key - The file key (path)
 * @param {string} contentType - The content type of the file
 * @returns {Promise<Object>} - The upload result
 */
const uploadFile = async (fileBuffer, key, contentType) => {
  const params = {
    Bucket: bucketName,
    Key: key,
    Body: fileBuffer,
    ContentType: contentType,
  };

  const command = new PutObjectCommand(params);
  return await s3Client.send(command);
};

/**
 * Generate a signed URL for video streaming
 * @param {string} key - The file key
 * @param {number} expiresIn - URL expiration in seconds (default: 3600)
 * @returns {Promise<string>} - The signed URL
 */
const getSignedVideoUrl = async (key, expiresIn = 3600) => {
  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: key,
  });

  return await getSignedUrl(s3Client, command, { expiresIn });
};

/**
 * Generate a public URL for R2 assets
 * @param {string} key - The file key
 * @returns {string} - The public URL
 */
const getPublicUrl = (key) => {
  // Check if custom domain is configured
  if (process.env.R2_CUSTOM_DOMAIN) {
    return `https://${process.env.R2_CUSTOM_DOMAIN}/${key}`;
  }

  // Use default R2 public URL format
  return `https://${process.env.R2_PUBLIC_URL}/${bucketName}/${key}`;
};

/**
 * Check if a file exists in R2
 * @param {string} key - The file key
 * @returns {Promise<boolean>} - Whether the file exists
 */
const fileExists = async (key) => {
  try {
    const command = new HeadObjectCommand({
      Bucket: bucketName,
      Key: key,
    });
    await s3Client.send(command);
    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Delete a file from R2
 * @param {string} key - The file key
 * @returns {Promise<Object>} - The deletion result
 */
const deleteFile = async (key) => {
  const command = new DeleteObjectCommand({
    Bucket: bucketName,
    Key: key,
  });
  return await s3Client.send(command);
};

module.exports = {
  uploadFile,
  getSignedVideoUrl,
  getPublicUrl,
  fileExists,
  deleteFile,
};