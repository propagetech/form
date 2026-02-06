const { pool } = require('./db');
const sitesConfig = require('../sites_config.json');

const seedSites = async () => {
  const client = await pool.connect();
  try {
    console.log(`Seeding ${sitesConfig.length} sites...`);
    
    for (const site of sitesConfig) {
      await client.query(`
        INSERT INTO sites (id, domain, owner_email, config)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (id) DO UPDATE 
        SET domain = EXCLUDED.domain, 
            owner_email = EXCLUDED.owner_email,
            config = EXCLUDED.config;
      `, [site.id, site.domain, site.owner_email, JSON.stringify(site)]);
      
      console.log(`Upserted site: ${site.id}`);
    }
    
    console.log("Seeding complete.");
  } catch (err) {
    console.error("Error seeding sites:", err);
  } finally {
    client.release();
    pool.end(); // Close connection after script
  }
};

seedSites();
