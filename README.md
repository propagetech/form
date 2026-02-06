# Form Factory Project

A centralized "Factory" system to generate, deploy, and manage 50+ secure, database-driven websites with AWS S3, Cloudflare, and a shared Node.js backend.

## Architecture

*   **Frontend**: 50+ Static HTML/CSS/JS sites hosted on **AWS S3** (via Cloudflare).
*   **Backend**: Shared Node.js API hosted on **AWS Lightsail**.
*   **Database**: Centralized **PostgreSQL** database (Multi-tenant).
*   **Storage**: **Cloudflare R2** for PDF storage.
*   **Email**: **AWS SES** for transactional emails.
*   **Deployment**: **GitHub Actions** (Multi-repo provisioning).

## Relevant URLs

### Infrastructure
*   **Backend API**: 
    *   Development: `http://localhost:3000`
    *   Production: `https://api.your-backend-domain.com` (Set in `generate_sites.js` or GitHub Secrets)
*   **Cloudflare R2 (PDFs)**:
    *   Public Endpoint: `https://files.your-domain.com` (or `https://<bucket>.r2.dev`)
*   **S3 Website Endpoint**:
    *   Format: `http://<domain>.s3-website-<region>.amazonaws.com`

### Key Files
*   `sites_config.json`: Configuration for all 50 sites (Domains, Form Fields, Themes).
*   `generate_sites.js`: The "Factory" script that builds the `dist/` folder.
*   `provision_repos.js`: Automates creating GitHub repos and setting secrets for each site.
*   `deploy_s3.js`: Legacy script for direct S3 deployment (replaced by per-site GitHub Actions).

## Getting Started

1.  **Install Dependencies**:
    ```bash
    npm install
    cd backend && npm install
    ```

2.  **Setup Environment**:
    Create a `.env` file in the root and `backend/` directory with your AWS/Cloudflare credentials.

3.  **Generate Sites**:
    ```bash
    node generate_sites.js
    ```

4.  **Provision & Deploy**:
    ```bash
    # Set GITHUB_TOKEN and AWS credentials in shell first
    node provision_repos.js
    ```
