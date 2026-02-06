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
const sitesConfig = require('./sites_config.json');

// AWS Configuration
const s3Client = new S3Client({ region: process.env.AWS_REGION || "us-east-1" });

const DIST_DIR = path.join(__dirname, 'dist');

async function deploySite(site) {
    const bucketName = site.domain;
    const siteDir = path.join(DIST_DIR, site.domain);

    if (!fs.existsSync(siteDir)) {
        console.error(`Error: Directory for ${site.domain} not found in dist/. Run generate_sites.js first.`);
        return;
    }

    try {
        console.log(`\nDeploying ${site.domain}...`);

        // 1. Create Bucket
        try {
            await s3Client.send(new CreateBucketCommand({ Bucket: bucketName }));
            console.log(`- Bucket created: ${bucketName}`);
        } catch (err) {
            if (err.name === 'BucketAlreadyOwnedByYou') {
                console.log(`- Bucket already exists: ${bucketName}`);
            } else {
                throw err;
            }
        }

        // 2. Disable "Block Public Access" (Required for Static Website Hosting)
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
                ErrorDocument: { Key: "index.html" } // SPA fallback if needed
            }
        }));
        console.log(`- Static hosting enabled`);

        // 3. Set Public Read Policy
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

        // 4. Upload Files
        const files = fs.readdirSync(siteDir);
        for (const file of files) {
            const filePath = path.join(siteDir, file);
            const fileContent = fs.readFileSync(filePath);
            const contentType = mime.lookup(filePath) || 'application/octet-stream';

            await s3Client.send(new PutObjectCommand({
                Bucket: bucketName,
                Key: file,
                Body: fileContent,
                ContentType: contentType
            }));
            console.log(`  - Uploaded: ${file}`);
        }

        console.log(`✓ Deployed: http://${bucketName}.s3-website-${process.env.AWS_REGION || "us-east-1"}.amazonaws.com`);

    } catch (err) {
        console.error(`Failed to deploy ${site.domain}:`, err.message);
    }
}

async function main() {
    console.log(`Starting deployment for ${sitesConfig.length} sites to AWS S3...`);
    for (const site of sitesConfig) {
        await deploySite(site);
    }
    console.log("\nAll sites processed.");
}

main();
