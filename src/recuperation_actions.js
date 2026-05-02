const fs = require('fs');
const https = require('https');
const path = require('path');

const CACHE_FILE = path.join('data-files', 'actions_cache.json');
const PAGE_SIZE = 250;
const DELAY_MS = 300;
/** Log console toutes les N pages (+ 1re et derniere) pendant le telechargement XIVAPI */
const PROGRESS_LOG_EVERY = 5;

const SHEETS = ['Action', 'CraftAction'];

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                if (res.statusCode < 200 || res.statusCode >= 300) {
                    reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
                    return;
                }
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error(`Erreur JSON : ${e.message}\nRaw: ${data.slice(0, 300)}`));
                }
            });
        }).on('error', reject);
    });
}

function ensureCacheDir() {
    const dir = path.dirname(CACHE_FILE);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function loadCache() {
    if (!fs.existsSync(CACHE_FILE)) {
        return null;
    }
    try {
        const raw = fs.readFileSync(CACHE_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.byEnglishName === 'object') {
            console.log(`[actions] Cache trouvé : ${Object.keys(parsed.byEnglishName).length} noms EN`);
            return parsed.byEnglishName;
        }
        return null;
    } catch (e) {
        console.warn('[actions] Cache illisible, re-téléchargement...');
        return null;
    }
}

function saveCache(byEnglishName) {
    ensureCacheDir();
    fs.writeFileSync(
        CACHE_FILE,
        JSON.stringify({ byEnglishName, updatedAt: new Date().toISOString() }),
        'utf8'
    );
    console.log(`[actions] Cache sauvegardé : ${Object.keys(byEnglishName).length} entrées`);
}

function buildUrl(sheetName, cursor) {
    const base = `https://v2.xivapi.com/api/sheet/${sheetName}`;
    let url = `${base}?fields=${encodeURIComponent('Name,Name@lang(fr)')}&limit=${PAGE_SIZE}`;
    if (cursor !== null) {
        url += `&after=${cursor}`;
    }
    return url;
}

function mergeRows(rows, byEnglishName) {
    rows.forEach(row => {
        const nameEn = (row.fields?.Name || '').trim();
        const nameFr = (row.fields?.['Name@lang(fr)'] || '').trim();
        if (!nameEn) {
            return;
        }
        if (!byEnglishName[nameEn]) {
            byEnglishName[nameEn] = nameFr || nameEn;
        }
    });
}

async function fetchSheet(sheetName, byEnglishName) {
    let cursor = null;
    let page = 0;

    console.log(`[actions] Debut feuille "${sheetName}" (${PAGE_SIZE} lignes/page, ${DELAY_MS}ms entre pages)`);

    do {
        page++;
        const url = buildUrl(sheetName, cursor);

        let data;
        let retries = 3;
        while (retries > 0) {
            try {
                data = await fetchJson(url);
                break;
            } catch (e) {
                retries--;
                if (retries === 0) {
                    throw e;
                }
                console.log(`[actions] Erreur "${sheetName}" page ${page}, nouvel essai dans 2s (${retries} restants)`);
                await sleep(2000);
            }
        }

        if (!data.rows || data.rows.length === 0) {
            break;
        }

        mergeRows(data.rows, byEnglishName);
        cursor = data.rows[data.rows.length - 1].row_id;

        const countEn = Object.keys(byEnglishName).length;
        const isLastPage = data.rows.length < PAGE_SIZE;
        if (page === 1 || page % PROGRESS_LOG_EVERY === 0 || isLastPage) {
            console.log(`[actions] "${sheetName}" | page ${page} | dernier row_id=${cursor} | ${countEn} noms EN indexes (cumul toutes feuilles)`);
        }

        if (isLastPage) {
            break;
        }

        await sleep(DELAY_MS);
    } while (true);

    console.log(`[actions] Fin feuille "${sheetName}" : ${page} page(s) parcourue(s)`);
}

async function fetchAllActionsFromApi() {
    const byEnglishName = {};

    console.log(`[actions] Telechargement XIVAPI (sans cache disque) : feuilles ${SHEETS.join(', ')}`);

    for (let i = 0; i < SHEETS.length; i++) {
        const sheet = SHEETS[i];
        console.log(`[actions] Feuille ${i + 1}/${SHEETS.length} : "${sheet}"`);
        try {
            await fetchSheet(sheet, byEnglishName);
        } catch (e) {
            console.error(`[actions] Feuille "${sheet}" ignorée ou erreur:`, e.message);
        }
    }

    console.log(`[actions] Telechargement termine : ${Object.keys(byEnglishName).length} noms EN indexes (EN → FR)`);
    return byEnglishName;
}

/**
 * Dictionnaire nom de sort (EN) → nom FR. Cache local data-files/actions_cache.json
 * @returns {Promise<Object.<string, string>>}
 */
async function recuperationActionsFromFiles() {
    const cached = loadCache();
    if (cached) {
        return cached;
    }

    console.log('[actions] Pas de cache valide : demarrage du telechargement complet (voir progression ci-dessous).');
    const byEnglishName = await fetchAllActionsFromApi();
    saveCache(byEnglishName);
    return byEnglishName;
}

module.exports = recuperationActionsFromFiles;
