# Monthly Operational Cost Breakdown
**Project**: 50 Secure, Database-Driven Websites  
**Architecture**: Centralized Backend on AWS Lightsail + Cloudflare Edge

## 1. Summary
Your total estimated infrastructure cost is **~$42.00 per month**.  
This averages to **$0.84 per website / month**.

| Item | Service Provider | Monthly Cost | Notes |
| :--- | :--- | :--- | :--- |
| **Server (VPS)** | AWS Lightsail (Large) | $40.00 | 4 vCPU, 8GB RAM, 160GB SSD, 5TB Transfer |
| **Email Service** | AWS SES | ~$2.00 | Based on ~20,000 emails/month |
| **Security & DNS** | Cloudflare | $0.00 | Free Tier (unlimited bandwidth) |
| **Database** | Self-Hosted (PostgreSQL) | $0.00 | Included in VPS resources |
| **SSL Certificates** | Cloudflare | $0.00 | Managed automatically |
| **Backups** | AWS Lightsail Snapshots | ~$2.00 | Optional: Daily snapshots |
| **TOTAL** | | **~$44.00** | **($0.88 / site)** |

---

## 2. Detailed Breakdown

### A. Hosting: AWS Lightsail ($40/mo)
We selected the **Large Instance** ($40/mo) to ensure high performance for 50 concurrent sites.
*   **Specs**: 4 vCPUs, 8GB RAM, 160GB SSD.
*   **Why**: Node.js and PostgreSQL love RAM. 8GB allows us to cache database queries and handle traffic spikes without slowdowns.
*   **Bandwidth**: Includes **5 TB** of data transfer. This is huge. For context, 50 text-heavy sites with moderate traffic would likely use less than 500GB.
    *   *Note*: On standard AWS EC2, 5TB of bandwidth would cost ~$450/month. Lightsail bundles it for free.

### B. Email: AWS SES (~$2/mo)
AWS Simple Email Service (SES) is pay-as-you-go.
*   **Pricing**: $0.10 per 1,000 emails sent.
*   **Estimate**: 
    *   Assume 50 sites.
    *   Assume 10 submissions per day per site = 500 submissions/day.
    *   Emails per submission = 2 (1 to Owner, 1 to User).
    *   Total: 1,000 emails/day = 30,000 emails/month.
*   **Cost**: 30 * $0.10 = **$3.00/month**.
*   *Note*: The first 62,000 emails/month are often free if sent from an EC2-hosted application (which Lightsail counts as), making this effectively **$0**.

### C. Security: Cloudflare (Free)
*   **WAF (Web Application Firewall)**: Free. Blocks SQL injection and hackers.
*   **CDN**: Free. Caches your HTML/CSS/JS globally, reducing load on your $40 server.
*   **SSL**: Free. Saves ~$10/year per domain ($500/year savings).

### D. Hidden Savings (What you are NOT paying for)
By choosing this Self-Hosted + Cloudflare architecture, you are avoiding these typical enterprise costs:
*   **Managed Database (RDS)**: Typically ~$30-60/month for this performance. **Saved: $50/mo**.
*   **Load Balancer**: Included in Nginx setup. **Saved: $20/mo**.
*   **SaaS Form Builders**: Typeform/JotForm charge ~$30/month *per account*. **Saved: $1,500+/mo**.

## 3. Scaling Costs (Future Proofing)
If your traffic doubles (e.g., to 100 sites):
*   **Server**: Upgrade to AWS Lightsail X-Large ($80/mo).
*   **Email**: Scales linearly ($6/mo).
*   **Cloudflare**: Still Free.
*   **Total**: ~$86/mo ($0.86/site).

## 4. One-Time Costs (Excluded from Monthly OpEx)
*   **Domain Names**: ~$10-15 per year per domain (paid to Registrar like Namecheap/GoDaddy).
    *   Total: ~$500/year for 50 domains.
