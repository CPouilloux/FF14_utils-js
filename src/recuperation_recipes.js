const fs = require('fs');
const https = require('https');
const path = require('path');

const CACHE_FILE = path.join('data-files', 'recipes_cache.json');
const BASE_URL = 'https://v2.xivapi.com/api/sheet/Recipe';
const FIELDS = encodeURIComponent(
    'ItemResult.row_id,AmountResult,CraftType.Name,RecipeLevelTable.ClassJobLevel,Ingredient@as(raw),AmountIngredient'
);
const PAGE_SIZE = 250;
const DELAY_MS = 300;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        https
            .get(url, (res) => {
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk;
                });
                res.on('end', () => {
                    if (res.statusCode < 200 || res.statusCode >= 300) {
                        reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
                        return;
                    }
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject(new Error(`Erreur JSON : ${e.message}`));
                    }
                });
            })
            .on('error', reject);
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
        if (parsed && typeof parsed.recipes === 'object') {
            console.log(`[recipes] Cache trouvé : ${Object.keys(parsed.recipes).length} recettes`);
            return parsed.recipes;
        }
        return null;
    } catch (e) {
        console.warn('[recipes] Cache illisible, re-téléchargement...');
        return null;
    }
}

function saveCache(recipes) {
    ensureCacheDir();
    fs.writeFileSync(
        CACHE_FILE,
        JSON.stringify({ recipes, updatedAt: new Date().toISOString() }),
        'utf8'
    );
    console.log(`[recipes] Cache sauvegardé : ${Object.keys(recipes).length} recettes`);
}

function compactRecipeRow(row) {
    const f = row.fields || {};
    const ir = f.ItemResult;
    const resultId = ir?.row_id != null ? ir.row_id : ir?.value;
    if (!resultId || resultId === 0) {
        return null;
    }
    const raw = f['Ingredient@as(raw)'] || [];
    const amounts = f.AmountIngredient || [];
    const ingredientIds = [];
    const ingredientAmounts = [];
    for (let i = 0; i < raw.length; i++) {
        const id = raw[i];
        if (!id) {
            continue;
        }
        const amt = amounts[i];
        if (!amt || amt <= 0) {
            continue;
        }
        ingredientIds.push(id);
        ingredientAmounts.push(amt);
    }
    const ctf = (f.CraftType || {}).fields || {};
    const rltf = (f.RecipeLevelTable || {}).fields || {};
    return {
        resultItemId: String(resultId),
        amountResult: f.AmountResult != null ? f.AmountResult : 1,
        craftType: ctf.Name || '',
        level: rltf.ClassJobLevel != null ? rltf.ClassJobLevel : null,
        ingredientIds,
        ingredientAmounts
    };
}

function processRows(rows, recipes) {
    rows.forEach((row) => {
        const c = compactRecipeRow(row);
        if (c) {
            recipes[String(row.row_id)] = c;
        }
    });
}

function buildUrl(cursor) {
    let url = `${BASE_URL}?fields=${FIELDS}&limit=${PAGE_SIZE}`;
    if (cursor !== null) {
        url += `&after=${cursor}`;
    }
    return url;
}

async function fetchAllRecipesFromApi() {
    console.log('[recipes] Téléchargement depuis XIVAPI v2 (feuille Recipe)...');
    const recipes = {};
    let cursor = null;
    let page = 0;

    do {
        page++;
        const url = buildUrl(cursor);
        process.stdout.write(`\r[recipes] Page ${page} — ${Object.keys(recipes).length} recettes récupérées`);

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
                console.log(`\n[recipes] Erreur page ${page}, retry dans 2s... (${retries} restants)`);
                await sleep(2000);
            }
        }

        if (!data.rows || data.rows.length === 0) {
            break;
        }

        processRows(data.rows, recipes);
        cursor = data.rows[data.rows.length - 1].row_id;
        if (data.rows.length < PAGE_SIZE) {
            break;
        }
        await sleep(DELAY_MS);
    } while (true);

    console.log(`\n[recipes] ${Object.keys(recipes).length} recettes récupérées`);
    return recipes;
}

/**
 * Dictionnaire recipeId (string) → données compactes (résultat, ingrédients, niveau…).
 * Cache : data-files/recipes_cache.json — supprimer le fichier pour forcer un re-téléchargement.
 *
 * @returns {Promise<Object.<string, object>>}
 */
async function recuperationRecipesFromFiles() {
    const cached = loadCache();
    if (cached) {
        return cached;
    }

    const recipes = await fetchAllRecipesFromApi();
    saveCache(recipes);
    return recipes;
}

module.exports = recuperationRecipesFromFiles;
