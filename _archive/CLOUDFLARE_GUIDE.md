# Cloudflare + AWS S3 + GitHub Deployment Guide

This guide explains how to link your GitHub-deployed S3 buckets to Cloudflare for caching and SSL.

## 1. Prerequisites
1.  **GitHub Repository**: Push this code to a private GitHub repo.
2.  **AWS Credentials**: You need an AWS Access Key/Secret with permissions: `S3FullAccess` (or specifically `CreateBucket`, `PutBucketWebsite`, `PutBucketPolicy`, `PutPublicAccessBlock`, `PutObject`).
3.  **Cloudflare Account**: With your domains added.

## 2. GitHub Actions Setup
Go to your GitHub Repository -> **Settings** -> **Secrets and variables** -> **Actions**.
Add the following Repository Secrets:

*   `AWS_ACCESS_KEY_ID`: Your AWS Access Key.
*   `AWS_SECRET_ACCESS_KEY`: Your AWS Secret Key.
*   `AWS_REGION`: e.g., `us-east-1`.
*   `BACKEND_API_URL`: The public URL of your Lightsail backend (e.g., `https://api.your-backend.com`).

**Usage**: Every time you push to `main`, the workflow will:
1.  Generate static sites for all domains in `sites_config.json`.
2.  Create S3 buckets for any new domains.
3.  Upload the files to S3.

## 3. Cloudflare DNS Configuration
For **EACH** domain you deploy (e.g., `example.com`):

1.  **Login to Cloudflare** and select the domain.
2.  **Go to DNS**.
3.  Add a **CNAME Record**:
    *   **Type**: `CNAME`
    *   **Name**: `@` (root) or `www`
    *   **Target**: The S3 Website Endpoint.
        *   Format: `[bucket-name].s3-website-[region].amazonaws.com`
        *   Example: `example.com.s3-website-us-east-1.amazonaws.com`
    *   **Proxy Status**: **Proxied (Orange Cloud)**.
        *   *Crucial*: This enables Cloudflare's CDN and SSL.

## 4. Maximizing Bandwidth Savings (Important)
By default, Cloudflare **does not** cache HTML files, only images/CSS/JS. To cache your actual HTML pages (which are static) and save even more bandwidth:

1.  Go to **Rules** -> **Page Rules**.
2.  Click **Create Page Rule**.
3.  **URL**: `*example.com/*`
4.  **Setting**: `Cache Level` -> `Cache Everything`.
5.  **Save and Deploy**.

*Note: If you update your site content, you will need to Purge Cache in Cloudflare to see changes immediately.*

## 5. Why this saves money?
*   **Bandwidth**: Cloudflare caches your HTML, CSS, and JS at the edge. Users hit Cloudflare, not S3. This drastically reduces AWS Data Transfer Out fees.
*   **SSL**: Cloudflare provides free SSL. S3 Website Hosting does *not* support HTTPS natively with custom domains, but Cloudflare acts as the secure bridge.

## 5. Verification
1.  Push code to GitHub.
2.  Wait for Action to complete.
3.  Visit `https://example.com`.
4.  You should see the generated form.
5.  Check the Network tab -> The request should come from Cloudflare (look for `cf-cache-status` header).
