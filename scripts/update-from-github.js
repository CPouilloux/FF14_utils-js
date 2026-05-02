/**
 * Mise à jour depuis GitHub sans Git : télécharge la branche main, extrait,
 * copie par-dessus en préservant node_modules, .env et certains JSON locaux.
 * Usage : depuis la racine du projet → npm run update
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const os = require('os');
const { execFileSync, execSync } = require('child_process');

const DEFAULT_REPO = 'CPouilloux/FF14_utils-js';
const BRANCH = 'main';
const PRESERVE_REL = new Set([
    'node_modules',
    '.env',
    'data-files/saved_searches.json',
    'data-files/tracked_top_items.json'
]);

function projectRoot() {
    return path.resolve(__dirname, '..');
}

function zipUrl() {
    if (process.env.FF14_UPDATE_ZIP) {
        return process.env.FF14_UPDATE_ZIP.trim();
    }
    const repo = (process.env.FF14_UPDATE_REPO || DEFAULT_REPO).replace(/^\/+|\/+$/g, '');
    return `https://github.com/${repo}/archive/refs/heads/${BRANCH}.zip`;
}

function fetchUrl(u, redirect = 0) {
    if (redirect > 12) {
        return Promise.reject(new Error('Trop de redirections HTTP.'));
    }
    return new Promise((resolve, reject) => {
        const lib = u.startsWith('https:') ? https : http;
        lib
            .get(u, (res) => {
                const loc = res.headers.location;
                if ([301, 302, 303, 307, 308].includes(res.statusCode) && loc) {
                    res.resume();
                    const next = new URL(loc, u).href;
                    resolve(fetchUrl(next, redirect + 1));
                    return;
                }
                if (res.statusCode !== 200) {
                    res.resume();
                    reject(new Error(`HTTP ${res.statusCode} pour ${u}`));
                    return;
                }
                resolve(res);
            })
            .on('error', reject);
    });
}

function downloadToFile(url, destPath) {
    return fetchUrl(url).then(
        (res) =>
            new Promise((resolve, reject) => {
                const file = fs.createWriteStream(destPath);
                res.pipe(file);
                file.on('finish', () => file.close((err) => (err ? reject(err) : resolve())));
                file.on('error', reject);
            })
    );
}

function extractZip(zipPath, destDir) {
    try {
        execFileSync('tar', ['-xf', zipPath, '-C', destDir], { stdio: 'inherit' });
    } catch (e) {
        if (process.platform !== 'win32') {
            throw e;
        }
        const z = zipPath.replace(/'/g, "''");
        const d = destDir.replace(/'/g, "''");
        execFileSync(
            'powershell.exe',
            ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${z}' -DestinationPath '${d}' -Force`],
            { stdio: 'inherit' }
        );
    }
}

function singleSubdir(dir) {
    const entries = fs.readdirSync(dir).filter((n) => n !== 'repo.zip');
    if (entries.length !== 1) {
        throw new Error(`Archive inattendue : ${entries.length} éléments à la racine (${entries.join(', ')}).`);
    }
    return path.join(dir, entries[0]);
}

function relPosix(fromRoot, absPath) {
    return path.relative(fromRoot, absPath).split(path.sep).join('/');
}

function shouldCopyFromArchive(rel) {
    if (!rel || rel === '.') {
        return true;
    }
    const norm = rel.replace(/\\/g, '/');
    for (const p of PRESERVE_REL) {
        if (norm === p || norm.startsWith(`${p}/`)) {
            return false;
        }
    }
    return true;
}

function copyTreeFiltered(srcRoot, destRoot) {
    function walk(srcDir) {
        const names = fs.readdirSync(srcDir, { withFileTypes: true });
        for (const ent of names) {
            const src = path.join(srcDir, ent.name);
            const rel = relPosix(srcRoot, src);
            if (!shouldCopyFromArchive(rel)) {
                continue;
            }
            const dest = path.join(destRoot, rel);
            if (ent.isDirectory()) {
                fs.mkdirSync(dest, { recursive: true });
                walk(src);
            } else if (ent.isFile()) {
                fs.mkdirSync(path.dirname(dest), { recursive: true });
                fs.copyFileSync(src, dest);
            }
        }
    }
    walk(srcRoot);
}

function rimraf(dir) {
    if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

async function main() {
    const root = projectRoot();
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ff14-utils-update-'));
    const zipPath = path.join(tmp, 'repo.zip');

    console.log(`Téléchargement : ${zipUrl()}`);
    await downloadToFile(zipUrl(), zipPath);

    console.log('Extraction…');
    extractZip(zipPath, tmp);

    const extractedRoot = singleSubdir(tmp);
    console.log(`Copie des fichiers vers : ${root}`);
    copyTreeFiltered(extractedRoot, root);

    rimraf(tmp);

    console.log('npm install…');
    // shell: true — sous Windows, npm est un .cmd ; execFileSync sans shell peut échouer (EINVAL / ENOENT).
    execSync('npm install', { cwd: root, stdio: 'inherit', shell: true });

    console.log('');
    console.log('Mise à jour terminée. Relance l’app avec : npm start');
}

main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
});
