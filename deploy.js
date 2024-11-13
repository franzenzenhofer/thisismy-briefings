#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const child_process = require('child_process');
const util = require('util');
const exec = util.promisify(child_process.exec);

(async function main() {
    try {
        const BRIEFINGS_DIR = path.resolve(__dirname, 'briefings');
        const ROOT_TXT = path.resolve(__dirname, 'root.txt');

        // Ensure the briefings directory exists
        if (!fs.existsSync(BRIEFINGS_DIR)) {
            console.error(`Error: The briefings directory "${BRIEFINGS_DIR}" does not exist.`);
            process.exit(1);
        }

        // Get list of briefing files, excluding dot files
        const briefingFiles = fs.readdirSync(BRIEFINGS_DIR).filter(file => {
            return !file.startsWith('.') && fs.statSync(path.join(BRIEFINGS_DIR, file)).isFile();
        });

        // Generate keys and map filenames
        const fileToKey = generateKeys(briefingFiles);

        // Read existing entries from root.txt
        const existingEntries = readRootTxt(ROOT_TXT);

        // Update root.txt entries
        const updatedEntries = updateEntries(existingEntries, fileToKey);

        // Write updated entries to root.txt
        writeRootTxt(ROOT_TXT, updatedEntries);

        // Display the updated root.txt
        console.log('\nUpdated root.txt:');
        console.log('------------------');
        console.log(formatEntries(updatedEntries));

        // User interaction for manual editing and deployment
        const proceed = await userInteraction();

        if (proceed) {
            await deployChanges(ROOT_TXT, BRIEFINGS_DIR, briefingFiles);
        } else {
            console.log('Process terminated by the user.');
        }
    } catch (error) {
        console.error(`An error occurred: ${error.message}`);
        process.exit(1);
    }
})();

// Function to generate keys from filenames
function generateKeys(files) {
    const fileToKey = {};
    files.forEach(filename => {
        const filenameNoExt = filename.replace(/\.[^/.]+$/, ''); // Remove extension
        const filenameNoExtNoSuffix = filenameNoExt.replace(/\.thisismy$/, ''); // Remove '.thisismy' if present

        // Extract the base name until the numbers start
        const baseNameMatch = filenameNoExtNoSuffix.match(/^[^-]*-(?:[^-]*-)*?(?=\d)/);
        let baseName = baseNameMatch ? baseNameMatch[0] : filenameNoExtNoSuffix;

        // Remove any trailing hyphen
        baseName = baseName.replace(/-$/, '');

        // Convert to lowercase
        const key = `${baseName.toLowerCase()}`;

        fileToKey[key] = filename;
    });
    return fileToKey;
}

// Function to read existing entries from root.txt
function readRootTxt(rootTxtPath) {
    const entries = {};
    if (fs.existsSync(rootTxtPath)) {
        const content = fs.readFileSync(rootTxtPath, 'utf8');
        content.split('\n').forEach(line => {
            const match = line.match(/^([^:]+):\s*(.+)$/);
            if (match) {
                entries[match[1]] = match[2];
            }
        });
    }
    return entries;
}

// Function to update entries based on current briefing files
function updateEntries(existingEntries, newEntries) {
    // Remove entries that no longer exist
    Object.keys(existingEntries).forEach(key => {
        if (!newEntries[key]) {
            delete existingEntries[key];
        }
    });
    // Add new entries
    Object.assign(existingEntries, newEntries);
    return existingEntries;
}

// Function to write entries back to root.txt
function writeRootTxt(rootTxtPath, entries) {
    const content = formatEntries(entries);
    fs.writeFileSync(rootTxtPath, content, 'utf8');
}

// Function to format entries for root.txt
function formatEntries(entries) {
    return Object.entries(entries)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n');
}

// Function for user interaction
async function userInteraction() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    const question = (query) => new Promise((resolve) => rl.question(query, resolve));

    try {
        const editChoice = await question(
            '\nDo you want to manually edit root.txt before deploying? (yes/no): '
        );

        if (/^y(es)?$/i.test(editChoice.trim())) {
            console.log('Please edit root.txt as needed and rerun the script to deploy.');
            rl.close();
            return false;
        }

        const deployChoice = await question('Do you want to deploy? (yes/no): ');

        if (/^y(es)?$/i.test(deployChoice.trim())) {
            rl.close();
            return true;
        } else {
            rl.close();
            return false;
        }
    } catch (error) {
        rl.close();
        throw error;
    }
}

// Function to deploy changes via git
async function deployChanges(rootTxtPath, briefingsDir, briefingFiles) {
    try {
        // Ensure git is installed
        await exec('git --version');

        // Stage root.txt
        await exec(`git add "${rootTxtPath}"`);

        // Stage briefing files
        for (const file of briefingFiles) {
            const filePath = path.join(briefingsDir, file);
            await exec(`git add "${filePath}"`);
        }

        // Commit changes
        const commitMessage = 'Deploy updated briefings and root.txt';
        await exec(`git commit -m "${commitMessage}"`);

        // Push changes
        console.log('\nDeploying changes...');
        await exec('git push');

        console.log('Deployment completed successfully.');
    } catch (error) {
        throw new Error(`Deployment failed: ${error.message}`);
    }
}
