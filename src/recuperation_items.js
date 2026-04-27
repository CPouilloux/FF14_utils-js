const fs = require('fs');
const https = require('https');
const path = require('path');

const CACHE_FILE = path.join('data-files', 'items_cache.json');
// XIVAPI v2 — couvre tous les items incluant les derniers patches
const BASE_URL = 'https://v2.xivapi.com/api/sheet/Item';
// Name = EN par défaut, Name@lang(fr) = FR
const FIELDS = 'Name,Name@lang(fr)';
const PAGE_SIZE = 250;
const DELAY_MS = 300;

// -------------------------------------------------------
// Classe item
// -------------------------------------------------------
class Ff14Item {
    constructor(id, name_en, name_fr) {
        this.id = String(id);
        this.name_en = name_en || '';
        this.name_fr = name_fr || '';
    }
}

// -------------------------------------------------------
// Utilitaires
// -------------------------------------------------------
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
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

// -------------------------------------------------------
// Cache
// -------------------------------------------------------
function loadCache() {
    if (!fs.existsSync(CACHE_FILE)) return null;
    try {
        const raw = fs.readFileSync(CACHE_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        console.log(`[items] Cache trouvé : ${Object.keys(parsed).length} items`);
        return parsed;
    } catch (e) {
        console.warn('[items] Cache illisible, re-téléchargement...');
        return null;
    }
}

function saveCache(items) {
    ensureCacheDir();
    const toSave = {};
    for (const id in items) {
        toSave[id] = { name_en: items[id].name_en, name_fr: items[id].name_fr };
    }
    fs.writeFileSync(CACHE_FILE, JSON.stringify(toSave), 'utf8');
    console.log(`[items] Cache sauvegardé : ${Object.keys(toSave).length} items`);
}

// -------------------------------------------------------
// Téléchargement XIVAPI v2
// Pagination par curseur (after=row_id)
// -------------------------------------------------------
function buildUrl(cursor) {
    let url = `${BASE_URL}?fields=${encodeURIComponent(FIELDS)}&limit=${PAGE_SIZE}`;
    if (cursor !== null) url += `&after=${cursor}`;
    return url;
}

function processRows(rows, items) {
    rows.forEach(row => {
        const name_en = row.fields?.['Name'];
        const name_fr = row.fields?.['Name@lang(fr)'];
        if (name_en && name_en !== '') {
            items[String(row.row_id)] = new Ff14Item(row.row_id, name_en, name_fr);
        }
    });
}

async function fetchAllItemsFromApi() {
    console.log('[items] Téléchargement depuis XIVAPI v2...');

    const items = {};
    let cursor = null;
    let page = 0;

    do {
        page++;
        const url = buildUrl(cursor);
        process.stdout.write(`\r[items] Page ${page} — ${Object.keys(items).length} items récupérés`);

        let data;
        let retries = 3;
        while (retries > 0) {
            try {
                data = await fetchJson(url);
                break;
            } catch (e) {
                retries--;
                if (retries === 0) throw e;
                console.log(`\n[items] Erreur page ${page}, retry dans 2s... (${retries} restants)`);
                await sleep(2000);
            }
        }

        if (!data.rows || data.rows.length === 0) break;

        processRows(data.rows, items);

        // Curseur = row_id du dernier élément reçu
        cursor = data.rows[data.rows.length - 1].row_id;

        // Moins de résultats que PAGE_SIZE = dernière page
        if (data.rows.length < PAGE_SIZE) break;

        await sleep(DELAY_MS);

    } while (true);

    console.log(`\n[items] ${Object.keys(items).length} items récupérés`);
    return items;
}

// -------------------------------------------------------
// Point d'entrée
// -------------------------------------------------------

/**
 * Retourne un dictionnaire d'objets Ff14Item indexés par ID (string).
 * Utilise le cache local si disponible, sinon appelle XIVAPI v2.
 *
 * Pour forcer un re-téléchargement : supprimer data-files/items_cache.json
 *
 * @returns {Promise<Object.<string, Ff14Item>>}
 */
async function recuperationItemsFromFiles() {
    const cached = loadCache();
    if (cached) {
        const items = {};
        for (const id in cached) {
            items[id] = new Ff14Item(id, cached[id].name_en, cached[id].name_fr);
        }
        return items;
    }

    const items = await fetchAllItemsFromApi();
    saveCache(items);
    return items;
}

module.exports = recuperationItemsFromFiles;
