const fs = require('fs');
const path = require('path');
const sitesConfig = require('./sites_config.json');

// Configuration
const TEMPLATE_DIR = path.join(__dirname, 'frontend_template');
const OUTPUT_DIR = path.join(__dirname, 'dist');
// If hosting on S3, this MUST be the public URL of your Lightsail/Backend server
// e.g., 'https://api.central-engine.com' or 'http://1.2.3.4:3000'
const API_URL = process.env.API_URL || 'http://localhost:3000'; 
const RECAPTCHA_SITE_KEY = 'your-recaptcha-site-key'; // Replace with real key

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR);
}

// Helper: Generate HTML inputs from JSON config
function generateFormFields(fields) {
    return fields.map(field => {
        let inputHtml = '';
        const requiredAttr = field.required ? 'required' : '';
        
        switch (field.type) {
            case 'textarea':
                inputHtml = `<textarea id="${field.name}" name="${field.name}" ${requiredAttr} rows="4"></textarea>`;
                break;
            case 'select':
                const options = (field.options || []).map(opt => `<option value="${opt}">${opt}</option>`).join('');
                inputHtml = `<select id="${field.name}" name="${field.name}" ${requiredAttr}>${options}</select>`;
                break;
            default: // text, email, number, etc.
                inputHtml = `<input type="${field.type}" id="${field.name}" name="${field.name}" ${requiredAttr}>`;
        }

        return `
        <div class="form-group">
            <label for="${field.name}">${field.label}${field.required ? ' *' : ''}</label>
            ${inputHtml}
        </div>`;
    }).join('\n');
}

// Main Generator Loop
sitesConfig.forEach(site => {
    // Use domain name for folder to match Nginx dynamic routing
    const siteDir = path.join(OUTPUT_DIR, site.domain);
    
    // Create site directory
    if (!fs.existsSync(siteDir)) {
        fs.mkdirSync(siteDir);
    }

    console.log(`Generating site: ${site.domain} (${site.id})`);

    // 1. Process index.html
    let indexContent = fs.readFileSync(path.join(TEMPLATE_DIR, 'index.html'), 'utf8');
    
    // Replace placeholders
    const formFieldsHtml = generateFormFields(site.forms[0].fields); // Assuming 1 form per site for now
    
    indexContent = indexContent
        .replace(/{{SITE_TITLE}}/g, site.forms[0].title)
        .replace(/{{SITE_DOMAIN}}/g, site.domain)
        .replace(/{{YEAR}}/g, new Date().getFullYear())
        .replace(/{{SITE_ID}}/g, site.id)
        .replace(/{{API_URL}}/g, API_URL)
        .replace(/{{RECAPTCHA_SITE_KEY}}/g, RECAPTCHA_SITE_KEY)
        .replace('{{FORM_FIELDS_HTML}}', formFieldsHtml);

    fs.writeFileSync(path.join(siteDir, 'index.html'), indexContent);

    // 2. Process style.css
    let styleContent = fs.readFileSync(path.join(TEMPLATE_DIR, 'style.css'), 'utf8');
    
    styleContent = styleContent
        .replace('{{PRIMARY_COLOR}}', site.theme.primary_color)
        .replace('{{FONT_FAMILY}}', site.theme.font);

    fs.writeFileSync(path.join(siteDir, 'style.css'), styleContent);

    // 3. Copy script.js (no changes needed as it reads from window vars)
    fs.copyFileSync(path.join(TEMPLATE_DIR, 'script.js'), path.join(siteDir, 'script.js'));

    // 4. Copy Infrastructure Files (Deploy Script, Package.json, Workflow)
    fs.copyFileSync(path.join(TEMPLATE_DIR, 'deploy.js'), path.join(siteDir, 'deploy.js'));
    fs.copyFileSync(path.join(TEMPLATE_DIR, 'package.json'), path.join(siteDir, 'package.json'));

    const workflowDir = path.join(siteDir, '.github', 'workflows');
    if (!fs.existsSync(workflowDir)) {
        fs.mkdirSync(workflowDir, { recursive: true });
    }
    
    // Read the workflow template
    let workflowContent = fs.readFileSync(path.join(TEMPLATE_DIR, '.github/workflows/deploy.yml'), 'utf8');
    // We don't strictly need to replace anything in the workflow as it uses vars.SITE_DOMAIN
    // but we could hardcode it if we wanted. For now, we'll keep it generic and use Github Vars.
    fs.writeFileSync(path.join(workflowDir, 'deploy.yml'), workflowContent);

    // 5. Create .gitignore
    fs.writeFileSync(path.join(siteDir, '.gitignore'), 'node_modules\n.DS_Store\n');

    console.log(`✓ Generated ${site.domain}`);
});

console.log('All sites generated successfully in /dist');
