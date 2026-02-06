const fs = require('fs');
const path = require('path');
const simpleGit = require('simple-git');
const { Octokit } = require("@octokit/rest");
const sodium = require('sodium-native');

// Configuration
// You must set these environment variables before running the script
const GITHUB_TOKEN = process.env.GITHUB_TOKEN; // PAT with repo scope
const GITHUB_USERNAME = process.env.GITHUB_USERNAME; // e.g., 'your-username'
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';

const sitesConfig = require('./sites_config.json');
const DIST_DIR = path.join(__dirname, 'dist');

if (!GITHUB_TOKEN || !GITHUB_USERNAME || !AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
    console.error("Error: Missing required environment variables (GITHUB_TOKEN, GITHUB_USERNAME, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY).");
    process.exit(1);
}

const octokit = new Octokit({ auth: GITHUB_TOKEN });

// Encryption for GitHub Secrets (sodium-native)
function encryptSecret(key, secret) {
    const message = Buffer.from(secret);
    const box = Buffer.alloc(message.length + sodium.crypto_box_SEALBYTES);
    const publicKey = Buffer.from(key, 'base64');
    sodium.crypto_box_seal(box, message, publicKey);
    return box.toString('base64');
}

async function setRepoSecret(owner, repo, secretName, secretValue) {
    try {
        // 1. Get Public Key for the repo
        const { data: publicKey } = await octokit.actions.getRepoPublicKey({
            owner,
            repo,
        });

        // 2. Encrypt the secret
        const encryptedValue = encryptSecret(publicKey.key, secretValue);

        // 3. Create or Update the secret
        await octokit.actions.createOrUpdateRepoSecret({
            owner,
            repo,
            secret_name: secretName,
            encrypted_value: encryptedValue,
            key_id: publicKey.key_id,
        });
        console.log(`   - Secret set: ${secretName}`);
    } catch (err) {
        console.error(`   - Failed to set secret ${secretName}:`, err.message);
    }
}

async function setRepoVariable(owner, repo, varName, varValue) {
    try {
        // GitHub Vars are plain text
        try {
            await octokit.actions.createRepoVariable({
                owner,
                repo,
                name: varName,
                value: varValue
            });
        } catch(e) {
             // If variable exists, we might need to update it (delete and recreate or update)
             if (e.status === 409) {
                 await octokit.actions.updateRepoVariable({
                    owner,
                    repo,
                    name: varName,
                    value: varValue
                 });
             } else {
                 throw e;
             }
        }
        console.log(`   - Variable set: ${varName}`);
    } catch (err) {
        console.error(`   - Failed to set variable ${varName}:`, err.message);
    }
}

async function provisionSite(site) {
    const repoName = site.domain.replace(/\./g, '-'); // e.g., example.com -> example-com
    const siteDir = path.join(DIST_DIR, site.domain);

    console.log(`\nProcessing ${site.domain} -> Repo: ${repoName}`);

    if (!fs.existsSync(siteDir)) {
        console.error(`Error: Directory for ${site.domain} not found in dist/. Run generate_sites.js first.`);
        return;
    }

    try {
        // 1. Create GitHub Repository
        let repoUrl;
        try {
            const { data: repo } = await octokit.repos.createForAuthenticatedUser({
                name: repoName,
                private: true, // Create private repos by default
                description: `Website for ${site.domain}`
            });
            repoUrl = repo.clone_url;
            console.log(`   - Created repo: ${repo.html_url}`);
        } catch (err) {
            if (err.status === 422) { // Already exists
                console.log(`   - Repo already exists: ${repoName}`);
                repoUrl = `https://github.com/${GITHUB_USERNAME}/${repoName}.git`;
            } else {
                throw err;
            }
        }

        // 2. Initialize Git and Push Code
        const git = simpleGit(siteDir);
        
        // Check if already a git repo
        const isRepo = await git.checkIsRepo();
        if (!isRepo) {
            await git.init();
            await git.addConfig('user.name', 'Site Generator');
            await git.addConfig('user.email', 'generator@bot.com');
        }

        // Add remote (remove if exists to be safe)
        try { await git.removeRemote('origin'); } catch (e) {}
        // Use token in URL for auth
        const authRepoUrl = repoUrl.replace('https://', `https://${GITHUB_USERNAME}:${GITHUB_TOKEN}@`);
        await git.addRemote('origin', authRepoUrl);

        await git.add('.');
        await git.commit('Deploy: Initial Site Generation');
        await git.push(['-u', 'origin', 'main', '--force']); // Force push to overwrite if needed
        console.log(`   - Code pushed to main`);

        // 3. Set Secrets & Variables for GitHub Actions
        console.log(`   - Configuring Secrets & Variables...`);
        await setRepoSecret(GITHUB_USERNAME, repoName, 'AWS_ACCESS_KEY_ID', AWS_ACCESS_KEY_ID);
        await setRepoSecret(GITHUB_USERNAME, repoName, 'AWS_SECRET_ACCESS_KEY', AWS_SECRET_ACCESS_KEY);
        await setRepoSecret(GITHUB_USERNAME, repoName, 'AWS_REGION', AWS_REGION);
        
        await setRepoVariable(GITHUB_USERNAME, repoName, 'SITE_DOMAIN', site.domain);

    } catch (err) {
        console.error(`   - Failed to provision ${site.domain}:`, err.message);
    }
}

async function main() {
    console.log(`Starting GitHub Provisioning for ${sitesConfig.length} sites...`);
    for (const site of sitesConfig) {
        await provisionSite(site);
    }
    console.log("\nAll sites processed.");
}

main();
