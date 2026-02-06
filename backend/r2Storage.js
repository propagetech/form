const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

// Cloudflare R2 Configuration
// R2 is S3-compatible. We use the AWS SDK with Cloudflare's endpoint.
const r2Client = new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT, // e.g., https://<account_id>.r2.cloudflarestorage.com
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
});

const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;
const R2_PUBLIC_DOMAIN = process.env.R2_PUBLIC_DOMAIN; // e.g., https://files.yourdomain.com

/**
 * Uploads a file buffer to Cloudflare R2
 * @param {Buffer} buffer - The file content
 * @param {string} filename - The key/filename for the object
 * @param {string} contentType - MIME type
 * @returns {Promise<string>} - The public URL of the uploaded file
 */
async function uploadToR2(buffer, filename, contentType = 'application/pdf') {
    if (!R2_BUCKET_NAME || !process.env.R2_ENDPOINT) {
        throw new Error("R2 configuration missing (R2_BUCKET_NAME or R2_ENDPOINT)");
    }

    try {
        const command = new PutObjectCommand({
            Bucket: R2_BUCKET_NAME,
            Key: filename,
            Body: buffer,
            ContentType: contentType,
        });

        await r2Client.send(command);

        // Construct Public URL
        // If R2_PUBLIC_DOMAIN is set (Custom Domain), use it.
        // Otherwise, we might need to rely on the worker/public access setup.
        if (R2_PUBLIC_DOMAIN) {
            return `${R2_PUBLIC_DOMAIN}/${filename}`;
        } else {
            // Fallback (Not ideal as R2 bucket URLs are private by default unless public access enabled)
            return `https://${R2_BUCKET_NAME}.r2.dev/${filename}`; 
        }

    } catch (error) {
        console.error("R2 Upload Error:", error);
        throw new Error("Failed to upload file to storage.");
    }
}

module.exports = { uploadToR2 };
