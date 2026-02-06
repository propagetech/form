const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'forms_db',
  password: process.env.DB_PASSWORD || 'mysecretpassword',
  port: process.env.DB_PORT || 5432,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

// Initialize Schema
const initDb = async () => {
  let client;
  try {
    client = await pool.connect();
    console.log("Initializing Database Schema...");
    
    // Projects Table (renamed from sites for clarity, or kept as sites)
    // We'll keep 'sites' to minimize friction, but enhance it.
    await client.query(`
      CREATE TABLE IF NOT EXISTS sites (
        id VARCHAR(50) PRIMARY KEY, -- acts as API Key / Project ID
        domain VARCHAR(255), -- Whitelisted domain (CORS)
        name VARCHAR(255), -- Human readable name
        owner_email VARCHAR(255),
        
        -- Email Configuration
        email_template_subject VARCHAR(255) DEFAULT 'New Submission',
        email_template_body TEXT DEFAULT 'You received a new submission.',
        
        -- Visitor Email Configuration (Auto-reply)
        send_visitor_email BOOLEAN DEFAULT FALSE,
        visitor_email_subject VARCHAR(255) DEFAULT 'Thank you for your submission',
        visitor_email_body TEXT DEFAULT 'We have received your request.',
        
        -- PDF/Attachment Links (stored as JSON array of URLs)
        attachment_urls JSONB DEFAULT '[]', 
        
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Submissions Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS submissions (
        id SERIAL PRIMARY KEY,
        site_id VARCHAR(50) REFERENCES sites(id) ON DELETE CASCADE,
        data JSONB NOT NULL, -- The form fields
        metadata JSONB DEFAULT '{}', -- IP, User Agent, Referrer
        status VARCHAR(20) DEFAULT 'new', -- new, read, archived
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    console.log("Database Schema Initialized Successfully.");
  } catch (err) {
    console.error("Error initializing database:", err);
  } finally {
    if (client) client.release();
  }
};

module.exports = {
  pool,
  initDb
};
