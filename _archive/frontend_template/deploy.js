const fs = require('fs');
const path = require('path');
const { 
    S3Client, 
    CreateBucketCommand, 
    PutBucketWebsiteCommand, 
    PutObjectCommand, 
    PutBucketPolicyCommand,
    PutPublicAccessBlockCommand
} = require("@aws-sdk/client-s3");
const mime = require('mime-types');

// Configuration
// In a standalone repo, we don't rely on a global config file for the domain
// We expect the domain to be passed via ENV or derived, but for simplicity
// we will inject the domain into this script during generation.
const DOMAIN = process.env.SITE_DOMAIN; 
const REGION = process.env.AWS_REGION || "us-east-1";

if (!DOMAIN) {
    console.error("Error: SITE_DOMAIN environment variable is missing.");
    process.exit(1);
}

const s3Client = new S3Client({ region: REGION });

async function deploy() {
    console.log(`\nStarting deployment for ${DOMAIN}...`);
    const bucketName = DOMAIN;
    
    // We assume the build output is in the current directory or a specific folder
    // Since this script lives in the root of the repo, and index.html is there too:
    const buildDir = __dirname; 

    try {
        // 1. Create Bucket
        try {
            await s3Client.send(new CreateBucketCommand({ Bucket: bucketName }));
            console.log(`- Bucket created/verified: ${bucketName}`);
        } catch (err) {
            if (err.name === 'BucketAlreadyOwnedByYou') {
                console.log(`- Bucket already exists: ${bucketName}`);
            } else {
                throw err;
            }
        }

        // 2. Disable "Block Public Access"
        await s3Client.send(new PutPublicAccessBlockCommand({
            Bucket: bucketName,
            PublicAccessBlockConfiguration: {
                BlockPublicAcls: false,
                IgnorePublicAcls: false,
                BlockPublicPolicy: false,
                RestrictPublicBuckets: false
            }
        }));
        console.log(`- Public access blocks removed`);

        // 3. Enable Static Website Hosting
        await s3Client.send(new PutBucketWebsiteCommand({
            Bucket: bucketName,
            WebsiteConfiguration: {
                IndexDocument: { Suffix: "index.html" },
                ErrorDocument: { Key: "index.html" }
            }
        }));
        console.log(`- Static hosting enabled`);

        // 4. Set Public Read Policy
        const publicPolicy = {
            Version: "2012-10-17",
            Statement: [
                {
                    Sid: "PublicReadGetObject",
                    Effect: "Allow",
                    Principal: "*",
                    Action: "s3:GetObject",
                    Resource: `arn:aws:s3:::${bucketName}/*`
                }
            ]
        };
        
        await s3Client.send(new PutBucketPolicyCommand({
            Bucket: bucketName,
            Policy: JSON.stringify(publicPolicy)
        }));
        console.log(`- Public read policy applied`);

        // 5. Upload Files
        // We only upload specific files to avoid uploading the script itself or hidden files
        const filesToUpload = ['index.html', 'style.css', 'script.js'];
        
        for (const file of filesToUpload) {
            const filePath = path.join(buildDir, file);
            if (fs.existsSync(filePath)) {
                const fileContent = fs.readFileSync(filePath);
                const contentType = mime.lookup(filePath) || 'application/octet-stream';

                await s3Client.send(new PutObjectCommand({
                    Bucket: bucketName,
                    Key: file,
                    Body: fileContent,
                    ContentType: contentType
                }));
                console.log(`  - Uploaded: ${file}`);
            } else {
                console.warn(`  - Warning: ${file} not found, skipping.`);
            }
        }

        console.log(`\n✓ Deployed Successfully!`);
        console.log(`URL: http://${bucketName}.s3-website-${REGION}.amazonaws.com`);

    } catch (err) {
        console.error(`Failed to deploy ${DOMAIN}:`, err.message);
        process.exit(1);
    }
}

deploy();
