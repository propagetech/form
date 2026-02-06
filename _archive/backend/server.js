const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { SESv2Client, SendEmailCommand } = require("@aws-sdk/client-sesv2");
const { pool, initDb } = require('./db');
const { generatePDF } = require('./pdfGenerator'); // Import PDF Generator
const { uploadToR2 } = require('./r2Storage'); // Import R2 Storage
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize DB
initDb();

// Security Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      "script-src": ["'self'", "'unsafe-inline'"],
      "script-src-attr": ["'unsafe-inline'"],
    },
  },
}));
// Configure CORS to allow requests from S3 hosted sites
// In production, list your 50 domains here, or use a wildcard if comfortable
app.use(cors({
  origin: '*', // For development. Change to whitelist in production.
  methods: ['POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(morgan('combined'));

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 100 
});
app.use(limiter);

// AWS SES Setup
const ses = new SESv2Client({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const sendEmail = async ({ from, to, subject, text, html }) => {
  const input = {
    FromEmailAddress: from,
    Destination: { ToAddresses: Array.isArray(to) ? to : [to] },
    Content: {
      Simple: {
        Subject: { Data: subject, Charset: "UTF-8" },
        Body: {
          Text: { Data: text || "", Charset: "UTF-8" },
          Html: { Data: html || "", Charset: "UTF-8" }
        }
      }
    }
  };
  const command = new SendEmailCommand(input);
  await ses.send(command);
};

// Routes
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date() });
});

app.post('/api/submit/:siteId', async (req, res) => {
  const { siteId } = req.params;
  const { data, recaptchaToken, timestamp } = req.body;
  const origin = req.get('origin');
  
  // TODO: Validate ReCAPTCHA Token here

  console.log(`Received submission for site: ${siteId}`, data);

  try {
    // 1. Fetch Site Config & Validate Domain (CORS/Whitelist)
    const siteQuery = `
        SELECT * FROM sites WHERE id = $1
    `;
    const siteResult = await pool.query(siteQuery, [siteId]);
    
    if (siteResult.rows.length === 0) {
        return res.status(404).json({ error: 'Site ID not found' });
    }

    const siteConfig = siteResult.rows[0];

    // Whitelist Check (Optional: Strict Mode)
    // If siteConfig.domain is set, enforce it.
    if (siteConfig.domain && origin) {
        // Simple check: does origin contain the domain?
        // Production should use stricter URL parsing
        if (!origin.includes(siteConfig.domain) && !origin.includes('localhost')) {
            console.warn(`Origin mismatch: ${origin} vs ${siteConfig.domain}`);
            // return res.status(403).json({ error: 'Origin not allowed' }); 
            // We'll log warning for now to avoid breaking dev
        }
    }

    // 2. Save to Database
    const insertQuery = `
      INSERT INTO submissions (site_id, data, metadata)
      VALUES ($1, $2, $3)
      RETURNING id
    `;
    const dbResult = await pool.query(insertQuery, [siteId, data, { recaptchaToken, timestamp, origin }]);
    console.log(`Saved submission ID: ${dbResult.rows[0].id}`);

    // 3. Send Email to Owner (if configured)
    if (siteConfig.owner_email) {
        const emailSubject = siteConfig.email_template_subject || `New Submission for ${siteConfig.name || siteId}`;
        const emailBody = `
            ${siteConfig.email_template_body || 'You received a new submission:'}
            
            ${Object.entries(data).map(([k, v]) => `${k}: ${v}`).join('\n')}
        `;

        await sendEmail({
          from: process.env.SENDER_EMAIL,
          to: siteConfig.owner_email,
          subject: emailSubject,
          text: emailBody,
          html: `
            <h3>${emailSubject}</h3>
            <p>${siteConfig.email_template_body || 'You received a new submission:'}</p>
            <table border="1" cellpadding="5" cellspacing="0">
                ${Object.entries(data).map(([k, v]) => `<tr><td><b>${k}</b></td><td>${v}</td></tr>`).join('')}
            </table>
          `
        });
    }

    // 4. Send Acknowledgment to Visitor (if email field exists AND enabled)
    if (data.email && siteConfig.send_visitor_email) {
      
      let pdfUrl = null;
      // Only generate PDF if explicitly requested/configured? 
      // For now, we keep the logic: always generate if we are sending an email
      try {
          const pdfBuffer = await generatePDF(data, siteId);
          const filename = `submission-${siteId}-${Date.now()}.pdf`;
          pdfUrl = await uploadToR2(pdfBuffer, filename);
      } catch(e) {
          console.error("Failed to generate/upload PDF:", e);
      }

      // Append Custom Attachment URLs from Config
      const extraLinks = siteConfig.attachment_urls || [];
      const linksHtml = extraLinks.map(link => `<p><a href="${link}">Download Attachment</a></p>`).join('');
      const pdfLinkHtml = pdfUrl ? `<p><a href="${pdfUrl}">Download Submission PDF</a></p>` : '';

      await sendEmail({
        from: process.env.SENDER_EMAIL,
        to: data.email,
        subject: siteConfig.visitor_email_subject || `We received your request`,
        text: `
          ${siteConfig.visitor_email_body || 'Thank you for contacting us.'}
          
          ${pdfUrl ? `Download Submission: ${pdfUrl}` : ''}
          ${extraLinks.join('\n')}
        `,
        html: `
          <p>${siteConfig.visitor_email_body || 'Thank you for contacting us.'}</p>
          ${pdfLinkHtml}
          ${linksHtml}
        `
      });
    }

    res.status(200).json({ message: 'Submission received successfully' });
  } catch (error) {
    console.error("Error processing submission:", error);
    res.status(500).json({ 
      message: 'Internal Server Error', 
      error: error.message 
    });
  }
});

// ==========================================
// ADMIN API ROUTES
// ==========================================

// Serve Static Admin Dashboard
app.use(express.static('public'));

// 1. List Projects (Sites)
app.get('/api/admin/projects', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM sites ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. Create/Update Project
app.post('/api/admin/projects', async (req, res) => {
    const { 
        id, domain, name, owner_email, 
        email_template_subject, email_template_body,
        send_visitor_email, visitor_email_subject, visitor_email_body,
        attachment_urls 
    } = req.body;

    // Simple upsert logic
    const query = `
        INSERT INTO sites (
            id, domain, name, owner_email, 
            email_template_subject, email_template_body,
            send_visitor_email, visitor_email_subject, visitor_email_body,
            attachment_urls
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (id) DO UPDATE SET
            domain = EXCLUDED.domain,
            name = EXCLUDED.name,
            owner_email = EXCLUDED.owner_email,
            email_template_subject = EXCLUDED.email_template_subject,
            email_template_body = EXCLUDED.email_template_body,
            send_visitor_email = EXCLUDED.send_visitor_email,
            visitor_email_subject = EXCLUDED.visitor_email_subject,
            visitor_email_body = EXCLUDED.visitor_email_body,
            attachment_urls = EXCLUDED.attachment_urls
        RETURNING *
    `;

    try {
        const result = await pool.query(query, [
            id, domain, name, owner_email,
            email_template_subject, email_template_body,
            send_visitor_email, visitor_email_subject, visitor_email_body,
            JSON.stringify(attachment_urls || [])
        ]);
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. Get Submissions for a Project
app.get('/api/admin/projects/:id/submissions', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(
            'SELECT * FROM submissions WHERE site_id = $1 ORDER BY created_at DESC', 
            [id]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
