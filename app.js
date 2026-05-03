const recuperationItemsFromFiles = require("./src/recuperation_items");
const recuperationActionsFromFiles = require("./src/recuperation_actions");
const recuperationRecipesFromFiles = require("./src/recuperation_recipes");
const {
    sanitizeSearchFragment,
    searchRecipesInCache,
    browseRecipesInCache,
    formatRecipeDetailFromCache
} = require("./src/recipe_xivapi");
const {retrive_market_data, get_server_data} = require("./src/requete_market");
const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const port = Number.parseInt(process.env.PORT, 10) || 3000;
const SAVED_SEARCHES_FILE = path.join('data-files', 'saved_searches.json');
const TOP_ITEMS_REFRESH_MS = 15 * 60 * 1000;
const TOP_ITEMS_RECENT_ENTRIES = 100;
const TOP_ITEMS_MARKET_ENTRIES = 3;
const CHAOS_DATACENTER = 'chaos';
const TRACKED_TOP_ITEMS_FILE = path.join('data-files', 'tracked_top_items.json');
const ITEM_FAVORITES_FILE = path.join('data-files', 'item_favorites.json');
const MAX_TRACKED_TOP_ITEMS = 1000;
const CHAOS_STATS_CHUNK_SIZE = 50;
const CHAOS_STATS_CHUNK_DELAY_MS = 200;
const CHAOS_STATS_MAX_RETRIES = 4;
const CHAOS_STATS_RETRY_BASE_MS = 900;
const UNIVERSALIS_RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

app.use(express.static('public'));
app.set('view engine', 'ejs');
app.use(express.json());

let ff14_items;
/** @type {Record<string, object>|null} */
let ff14_recipes = null;
let topItemsCache = {
    data: null,
    lastRefreshedAt: null,
    inFlightPromise: null
};

let actionTranslateByEn = null;
let actionTranslatePairs = null;
/** @type {'idle'|'loading'|'ready'|'error'} */
let actionDictionaryPhase = 'idle';
let actionDictionaryError = null;
let actionDictionaryLoadPromise = null;

function buildActionTranslatePairs(byEnglishName) {
    return Object.entries(byEnglishName || {})
        .map(([en, fr]) => ({ en, fr: fr || en }))
        .sort((a, b) => b.en.length - a.en.length);
}

async function startActionDictionaryBackgroundLoad() {
    if (actionDictionaryPhase === 'loading' || actionDictionaryPhase === 'ready') {
        return actionDictionaryLoadPromise;
    }
    if (actionDictionaryPhase === 'error') {
        actionDictionaryPhase = 'idle';
        actionDictionaryError = null;
    }

    actionDictionaryPhase = 'loading';
    actionDictionaryError = null;
    actionTranslateByEn = null;
    actionTranslatePairs = null;

    actionDictionaryLoadPromise = (async () => {
        console.log('[actions] Chargement du dictionnaire sorts (cache ou XIVAPI) en arrière-plan...');
        try {
            const byEnglishName = await recuperationActionsFromFiles();
            actionTranslateByEn = byEnglishName;
            actionTranslatePairs = buildActionTranslatePairs(byEnglishName);
            actionDictionaryPhase = 'ready';
            console.log(`[actions] Dictionnaire prêt (${Object.keys(byEnglishName).length} noms EN).`);
        } catch (error) {
            actionDictionaryPhase = 'error';
            actionDictionaryError = error?.message || String(error);
            console.error('[actions] Echec du chargement du dictionnaire:', error);
        } finally {
            actionDictionaryLoadPromise = null;
        }
    })();

    return actionDictionaryLoadPromise;
}

function getMacroDictionaryStatePayload() {
    return {
        phase: actionDictionaryPhase,
        ready: actionDictionaryPhase === 'ready',
        entryCount: actionTranslateByEn ? Object.keys(actionTranslateByEn).length : 0,
        error: actionDictionaryPhase === 'error' ? actionDictionaryError : null
    };
}

function translateMacroSkillNames(text) {
    if (typeof text !== 'string') {
        return '';
    }
    if (!actionTranslatePairs || actionTranslatePairs.length === 0) {
        return text;
    }
    /** Marqueurs PUA : évite qu'une entrée courte (ex. EN "Travail" → "Labeur") ne s'applique au français déjà inséré (ex. "Travail de base"). */
    const mark = '\uE000';
    const pendingFr = [];
    let out = text;
    for (let i = 0; i < actionTranslatePairs.length; i++) {
        const { en, fr } = actionTranslatePairs[i];
        if (!en) {
            continue;
        }
        const escaped = en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        out = out.replace(new RegExp(escaped, 'g'), () => {
            const id = pendingFr.length;
            pendingFr.push(fr);
            return `${mark}FF14_MACRO_${id}${mark}`;
        });
    }
    for (let j = 0; j < pendingFr.length; j++) {
        const token = `${mark}FF14_MACRO_${j}${mark}`;
        out = out.split(token).join(pendingFr[j]);
    }
    return out;
}


async function init() {
    if (!ff14_items) {
        ff14_items = await recuperationItemsFromFiles();
    }
    if (!ff14_recipes) {
        ff14_recipes = await recuperationRecipesFromFiles();
    }
}

function getItemNameFromIds(id_list) {
    const to_return = {};
    id_list.forEach(item_id => {
        if (ff14_items[item_id]) {
            to_return[item_id] = ff14_items[item_id];
        }
    })
    return to_return;
}

function parseIdsParam(ids_param) {
    if (!ids_param || typeof ids_param !== 'string') {
        return [];
    }

    return ids_param
        .split(',')
        .map(id => id.trim())
        .filter(id => /^\d+$/.test(id));
}

function normalizeText(value) {
    if (typeof value !== 'string') {
        return '';
    }
    return value.trim().toLowerCase();
}

function parsePositiveInt(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return fallback;
    }
    return parsed;
}

function formatDateTime(dateValue) {
    if (!dateValue) {
        return 'Jamais';
    }
    return new Date(dateValue).toLocaleString('fr-FR');
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function ensureDataDir() {
    const dir = path.dirname(SAVED_SEARCHES_FILE);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function loadSavedSearches() {
    try {
        if (!fs.existsSync(SAVED_SEARCHES_FILE)) {
            return [];
        }
        const raw = fs.readFileSync(SAVED_SEARCHES_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.error('[saved-searches] Erreur lecture:', error);
        return [];
    }
}

function saveSavedSearches(searches) {
    ensureDataDir();
    fs.writeFileSync(SAVED_SEARCHES_FILE, JSON.stringify(searches, null, 2), 'utf8');
}

function loadItemFavorites() {
    try {
        if (!fs.existsSync(ITEM_FAVORITES_FILE)) {
            return [];
        }
        const raw = fs.readFileSync(ITEM_FAVORITES_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            return [];
        }
        return parsed
            .map((id) => String(id).trim())
            .filter((id) => /^\d+$/.test(id));
    } catch (error) {
        console.error('[item-favorites] Erreur lecture:', error);
        return [];
    }
}

function saveItemFavorites(ids) {
    ensureDataDir();
    const unique = [...new Set(ids.map((id) => String(id).trim()).filter((id) => /^\d+$/.test(id)))].sort(
        (a, b) => Number(a) - Number(b)
    );
    fs.writeFileSync(ITEM_FAVORITES_FILE, JSON.stringify(unique, null, 2), 'utf8');
}

function buildSavedSearchId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function buildMarketDetailPayload(ids_param) {
    const item_ids = parseIdsParam(ids_param);
    if (item_ids.length === 0) {
        return { error: "Parametre ids invalide. Exemple: /marketDetail?ids=5333,5334", status: 400 };
    }

    const ids_as_csv = item_ids.join(",");
    const items_mapping = getItemNameFromIds(item_ids);
    const json_data = await retrive_market_data(ids_as_csv);
    const server_data = get_server_data();

    return {
        data: json_data,
        server_data,
        items_mapping
    };
}

function toFiniteNumber(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeTopItemStats(itemId, itemStats) {
    const itemData = ff14_items?.[String(itemId)] || {};
    const regularSaleVelocity = toFiniteNumber(itemStats?.regularSaleVelocity, 0);
    const averagePrice = toFiniteNumber(itemStats?.averagePrice, 0);
    const minPrice = toFiniteNumber(itemStats?.minPrice, 0);
    const listingsCount = toFiniteNumber(itemStats?.listingsCount, 0);

    return {
        itemId: Number(itemId),
        name_fr: itemData.name_fr || `Item ${itemId}`,
        name_en: itemData.name_en || '',
        regularSaleVelocity,
        averagePrice,
        minPrice,
        listingsCount
    };
}

async function fetchMostRecentlyUpdatedItems() {
    const url = `https://universalis.app/api/v2/extra/stats/most-recently-updated?world=${CHAOS_DATACENTER}&entries=${TOP_ITEMS_RECENT_ENTRIES}`;
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Universalis most-recently-updated error: ${response.status}`);
    }
    const payload = await response.json();
    const entries = Array.isArray(payload?.items) ? payload.items : [];

    const dedupedItemIds = [];
    const seen = new Set();
    entries.forEach(entry => {
        const itemId = String(entry?.itemID || '').trim();
        if (/^\d+$/.test(itemId) && !seen.has(itemId)) {
            seen.add(itemId);
            dedupedItemIds.push(itemId);
        }
    });

    return { entries, dedupedItemIds };
}

function parseUniversalisChaosStatsPayload(payload) {
    if (payload?.items && typeof payload.items === 'object') {
        return payload.items;
    }
    if (payload?.itemID !== undefined) {
        return { [payload.itemID]: payload };
    }
    return {};
}

async function fetchTopItemsMarketStatsHttpOnce(itemIds) {
    const idsAsCsv = itemIds.join(',');
    const url = `https://universalis.app/api/v2/${CHAOS_DATACENTER}/${idsAsCsv}?entries=${TOP_ITEMS_MARKET_ENTRIES}`;
    const response = await fetch(url);
    if (!response.ok) {
        const err = new Error(`Universalis chaos stats error: ${response.status}`);
        err.status = response.status;
        throw err;
    }
    const payload = await response.json();
    return parseUniversalisChaosStatsPayload(payload);
}

async function fetchTopItemsMarketStats(itemIds) {
    if (!itemIds || itemIds.length === 0) {
        return {};
    }

    let lastError = null;
    for (let attempt = 1; attempt <= CHAOS_STATS_MAX_RETRIES; attempt++) {
        try {
            return await fetchTopItemsMarketStatsHttpOnce(itemIds);
        } catch (error) {
            lastError = error;
            const status = error?.status ?? 0;
            const canRetry = UNIVERSALIS_RETRYABLE_STATUS.has(status) && attempt < CHAOS_STATS_MAX_RETRIES;
            if (!canRetry) {
                break;
            }
            const waitMs = CHAOS_STATS_RETRY_BASE_MS * (2 ** (attempt - 1));
            console.warn(`[top-items] Universalis HTTP ${status} (lot ${itemIds.length} ids), tentative ${attempt}/${CHAOS_STATS_MAX_RETRIES}, attente ${waitMs}ms...`);
            await sleep(waitMs);
        }
    }

    if (itemIds.length > 1) {
        const mid = Math.floor(itemIds.length / 2);
        console.warn(`[top-items] Decoupage du lot (${itemIds.length} ids) apres echecs — ${lastError?.message || 'erreur'}`);
        const leftMap = await fetchTopItemsMarketStats(itemIds.slice(0, mid));
        await sleep(CHAOS_STATS_CHUNK_DELAY_MS);
        const rightMap = await fetchTopItemsMarketStats(itemIds.slice(mid));
        return { ...leftMap, ...rightMap };
    }

    console.warn(`[top-items] Universalis : abandon pour l'item ${itemIds[0]} — ${lastError?.message || 'erreur'}`);
    return {};
}

async function fetchTopItemsMarketStatsBatched(itemIds) {
    const unique = [...new Set((itemIds || []).map(id => String(id).trim()).filter(id => /^\d+$/.test(id)))];
    const merged = {};
    for (let i = 0; i < unique.length; i += CHAOS_STATS_CHUNK_SIZE) {
        const chunk = unique.slice(i, i + CHAOS_STATS_CHUNK_SIZE);
        const part = await fetchTopItemsMarketStats(chunk);
        Object.assign(merged, part);
        if (i + CHAOS_STATS_CHUNK_SIZE < unique.length) {
            await sleep(CHAOS_STATS_CHUNK_DELAY_MS);
        }
    }
    return merged;
}

function loadTrackedTopItemLastSeen() {
    try {
        if (!fs.existsSync(TRACKED_TOP_ITEMS_FILE)) {
            return {};
        }
        const raw = fs.readFileSync(TRACKED_TOP_ITEMS_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        const map = parsed?.lastSeenById;
        return map && typeof map === 'object' ? map : {};
    } catch (error) {
        console.error('[tracked-top-items] Erreur lecture:', error);
        return {};
    }
}

function saveTrackedTopItemLastSeen(lastSeenById) {
    ensureDataDir();
    fs.writeFileSync(
        TRACKED_TOP_ITEMS_FILE,
        JSON.stringify({ lastSeenById, updatedAt: new Date().toISOString() }, null, 2),
        'utf8'
    );
}

function mergeRecentIdsIntoTracked(lastSeenById, recentItemIds) {
    const nowIso = new Date().toISOString();
    const next = { ...lastSeenById };
    recentItemIds.forEach(id => {
        const key = String(id).trim();
        if (/^\d+$/.test(key)) {
            next[key] = nowIso;
        }
    });

    const keys = Object.keys(next);
    if (keys.length <= MAX_TRACKED_TOP_ITEMS) {
        return next;
    }

    keys.sort((a, b) => {
        const ta = new Date(next[a]).getTime();
        const tb = new Date(next[b]).getTime();
        return ta - tb;
    });

    const toRemove = keys.length - MAX_TRACKED_TOP_ITEMS;
    for (let i = 0; i < toRemove; i++) {
        delete next[keys[i]];
    }
    return next;
}

async function buildTopItemsPayload() {
    await init();
    const { entries, dedupedItemIds } = await fetchMostRecentlyUpdatedItems();
    const trackedBefore = loadTrackedTopItemLastSeen();
    const trackedAfter = mergeRecentIdsIntoTracked(trackedBefore, dedupedItemIds);
    saveTrackedTopItemLastSeen(trackedAfter);

    const candidateIds = Object.keys(trackedAfter);
    const marketStatsMap = await fetchTopItemsMarketStatsBatched(candidateIds);
    const rows = Object.keys(marketStatsMap).map(itemId => normalizeTopItemStats(itemId, marketStatsMap[itemId]));

    rows.sort((a, b) => b.regularSaleVelocity - a.regularSaleVelocity);

    return {
        generatedAt: new Date().toISOString(),
        updatedItemsCount: entries.length,
        uniqueItemsCount: dedupedItemIds.length,
        trackedItemsCount: candidateIds.length,
        topItems: rows
    };
}

async function refreshTopItemsCache() {
    try {
        const payload = await buildTopItemsPayload();
        topItemsCache.data = payload;
        topItemsCache.lastRefreshedAt = new Date().toISOString();
        return topItemsCache.data;
    } catch (error) {
        console.error('[top-items-cache] Erreur refresh:', error);
        if (topItemsCache.data) {
            console.warn('[top-items-cache] Conservation des donnees precedentes jusqu au prochain essai reussi.');
            return topItemsCache.data;
        }
        throw error;
    }
}

function isTopItemsCacheStale() {
    const now = Date.now();
    const lastRefreshedMs = topItemsCache.lastRefreshedAt ? new Date(topItemsCache.lastRefreshedAt).getTime() : 0;
    return !lastRefreshedMs || (now - lastRefreshedMs) >= TOP_ITEMS_REFRESH_MS;
}

function scheduleTopItemsRefreshIfNeeded(forceRefresh = false) {
    if (!forceRefresh && topItemsCache.data && !isTopItemsCacheStale()) {
        return;
    }
    if (!topItemsCache.inFlightPromise) {
        topItemsCache.inFlightPromise = refreshTopItemsCache()
            .finally(() => {
                topItemsCache.inFlightPromise = null;
            });
    }
}

function peekTopItemsSnapshot() {
    const data = topItemsCache.data;
    const refreshPending = Boolean(topItemsCache.inFlightPromise);
    if (data) {
        return {
            refreshPending,
            lastRefreshedAt: topItemsCache.lastRefreshedAt,
            topItems: Array.isArray(data.topItems) ? data.topItems : [],
            updatedItemsCount: data.updatedItemsCount ?? 0,
            uniqueItemsCount: data.uniqueItemsCount ?? 0,
            trackedItemsCount: data.trackedItemsCount ?? 0,
            generatedAt: data.generatedAt || null
        };
    }
    return {
        refreshPending,
        lastRefreshedAt: topItemsCache.lastRefreshedAt,
        topItems: [],
        updatedItemsCount: 0,
        uniqueItemsCount: 0,
        trackedItemsCount: 0,
        generatedAt: null
    };
}

async function getTopItemsData(options = {}) {
    const forceRefresh = options.forceRefresh === true;
    if (!forceRefresh && topItemsCache.data && !isTopItemsCacheStale()) {
        return topItemsCache.data;
    }
    scheduleTopItemsRefreshIfNeeded(forceRefresh);
    if (topItemsCache.inFlightPromise) {
        return topItemsCache.inFlightPromise;
    }
    return topItemsCache.data || {
        topItems: [],
        updatedItemsCount: 0,
        uniqueItemsCount: 0,
        trackedItemsCount: 0,
        generatedAt: null
    };
}

init();

/**
 * Liste index : filtres + pagination (partagé entre la page HTML et GET /api/items).
 * @param {Record<string, unknown>} query
 */
function getIndexListState(query) {
    const qFr = normalizeText(query.qFr);
    const qEn = normalizeText(query.qEn);
    const page = parsePositiveInt(query.page, 1);
    const perPage = Math.min(parsePositiveInt(query.perPage, 200), 500);

    const allItems = Object.values(ff14_items || {});
    const filteredItems = allItems.filter(item => {
        const matchFr = !qFr || (item.name_fr || '').toLowerCase().includes(qFr);
        const matchEn = !qEn || (item.name_en || '').toLowerCase().includes(qEn);
        return matchFr && matchEn;
    });

    const totalItems = filteredItems.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / perPage));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * perPage;
    const pagedItems = filteredItems.slice(start, start + perPage);

    return {
        data: pagedItems,
        qFr,
        qEn,
        page: safePage,
        perPage,
        totalItems,
        totalPages
    };
}

app.get('/', (req, res) => {
    const state = getIndexListState(req.query);
    res.render('index', {
        ...state,
        savedSearches: loadSavedSearches(),
        currentPath: req.path
    });
});

app.get('/favorites', async (req, res) => {
    try {
        await init();
        const ids = loadItemFavorites();
        const items = ids.map((id) => {
            const it = ff14_items && ff14_items[id];
            return {
                id,
                name_fr: it ? it.name_fr : '',
                name_en: it ? it.name_en : '',
                missing: !it
            };
        });
        const marketIdsCsv = ids.join(',');
        res.render('favorites', {
            items,
            marketIdsCsv,
            currentPath: req.path
        });
    } catch (error) {
        console.error('[favorites]', error);
        res.status(500).send('Erreur lors du chargement des favoris.');
    }
});

app.get('/api/items', (req, res) => {
    try {
        const state = getIndexListState(req.query);
        res.json({
            items: state.data.map(item => ({
                id: String(item.id),
                name_fr: item.name_fr || '',
                name_en: item.name_en || ''
            })),
            qFr: state.qFr,
            qEn: state.qEn,
            page: state.page,
            perPage: state.perPage,
            totalItems: state.totalItems,
            totalPages: state.totalPages
        });
    } catch (error) {
        console.error('[api/items]', error);
        res.status(500).json({ error: 'Erreur serveur.' });
    }
});

app.get('/api/saved-searches', (req, res) => {
    res.json(loadSavedSearches());
});

app.post('/api/saved-searches', (req, res) => {
    try {
        const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
        const rawItemIds = Array.isArray(req.body?.itemIds) ? req.body.itemIds : [];
        const itemIds = rawItemIds
            .map(id => String(id).trim())
            .filter(id => /^\d+$/.test(id));

        if (!name) {
            return res.status(400).json({ error: 'Le nom est obligatoire.' });
        }
        if (itemIds.length === 0) {
            return res.status(400).json({ error: 'Selection vide.' });
        }

        const searches = loadSavedSearches();
        const newSearch = {
            id: buildSavedSearchId(),
            name,
            itemIds,
            createdAt: new Date().toISOString()
        };
        searches.unshift(newSearch);
        saveSavedSearches(searches);
        res.status(201).json(newSearch);
    } catch (error) {
        console.error('[saved-searches] Erreur creation:', error);
        res.status(500).json({ error: 'Erreur serveur.' });
    }
});

app.delete('/api/saved-searches/:id', (req, res) => {
    try {
        const searchId = req.params.id;
        const searches = loadSavedSearches();
        const filtered = searches.filter(search => search.id !== searchId);
        if (filtered.length === searches.length) {
            return res.status(404).json({ error: 'Recherche introuvable.' });
        }
        saveSavedSearches(filtered);
        res.status(204).send();
    } catch (error) {
        console.error('[saved-searches] Erreur suppression:', error);
        res.status(500).json({ error: 'Erreur serveur.' });
    }
});

app.get('/api/item-favorites', (req, res) => {
    try {
        res.json({ ids: loadItemFavorites() });
    } catch (error) {
        console.error('[api/item-favorites]', error);
        res.status(500).json({ error: 'Erreur serveur.' });
    }
});

app.post('/api/item-favorites/toggle', (req, res) => {
    try {
        const raw = req.body?.itemId;
        const itemId = raw != null ? String(raw).trim() : '';
        if (!/^\d+$/.test(itemId)) {
            return res.status(400).json({ error: 'ID item invalide.' });
        }
        const ids = loadItemFavorites();
        const idx = ids.indexOf(itemId);
        let favorite;
        let next;
        if (idx >= 0) {
            next = ids.filter((_, i) => i !== idx);
            favorite = false;
        } else {
            next = ids.concat([itemId]);
            favorite = true;
        }
        saveItemFavorites(next);
        res.json({ id: itemId, favorite });
    } catch (error) {
        console.error('[api/item-favorites/toggle]', error);
        res.status(500).json({ error: 'Erreur serveur.' });
    }
});

app.get('/marketDetail', async (req, res) => {
    try {
        const ids_param = req.query["ids"];
        if (parseIdsParam(ids_param).length === 0) {
            return res.status(400).send("Parametre ids invalide. Exemple: /marketDetail?ids=5333,5334");
        }
        res.render('marketDetail', {
            ids_param: parseIdsParam(ids_param).join(","),
            savedSearches: loadSavedSearches(),
            currentPath: req.path
        });
    } catch (error) {
        console.error('[marketDetail] Erreur:', error);
        res.status(500).send("Erreur lors de la recuperation des donnees de marche.");
    }
});

app.get('/top-items', (req, res) => {
    try {
        scheduleTopItemsRefreshIfNeeded(false);
        const snap = peekTopItemsSnapshot();
        const hasListRows = Array.isArray(snap.topItems) && snap.topItems.length > 0;
        const showTopItemsLoadingOverlay = Boolean(snap.refreshPending && !hasListRows);
        const topItemsClientJson = JSON.stringify({ refreshPending: snap.refreshPending });
        res.render('top-items', {
            topItems: snap.topItems,
            updatedItemsCount: snap.updatedItemsCount,
            uniqueItemsCount: snap.uniqueItemsCount,
            trackedItemsCount: snap.trackedItemsCount,
            lastRefreshedAtLabel: formatDateTime(snap.lastRefreshedAt),
            topItemsRefreshPending: snap.refreshPending,
            showTopItemsLoadingOverlay,
            topItemsClientJson,
            currentPath: req.path
        });
    } catch (error) {
        console.error('[top-items] Erreur:', error);
        res.status(500).render('top-items', {
            topItems: [],
            updatedItemsCount: 0,
            uniqueItemsCount: 0,
            trackedItemsCount: 0,
            lastRefreshedAtLabel: formatDateTime(topItemsCache.lastRefreshedAt),
            topItemsRefreshPending: false,
            showTopItemsLoadingOverlay: false,
            topItemsClientJson: JSON.stringify({ refreshPending: false }),
            pageError: 'Impossible de preparer la page top items.',
            currentPath: req.path
        });
    }
});

app.get('/macro-translate', (req, res) => {
    const state = getMacroDictionaryStatePayload();
    res.render('macro-translate', {
        currentPath: req.path,
        macroDictStateJson: JSON.stringify(state),
        macroDictReady: state.ready === true
    });
});

app.get('/craft', (req, res) => {
    const qRaw = typeof req.query.q === 'string' ? req.query.q : '';
    res.render('craft', {
        currentPath: req.path,
        initialQ: qRaw
    });
});

app.get('/api/recipes/search', (req, res) => {
    try {
        const q = typeof req.query.q === 'string' ? req.query.q : '';
        if (!ff14_recipes || !ff14_items) {
            return res.status(503).json({
                error: 'Cache recettes ou items indisponible. Patienter le chargement au demarrage ou supprime data-files/recipes_cache.json puis redemarre.'
            });
        }
        const limit = Math.min(parsePositiveInt(req.query.limit, 120), 200);
        const safe = sanitizeSearchFragment(q);
        if (safe.length === 0) {
            const browseLimit = Math.min(limit, 45);
            const recipes = browseRecipesInCache(ff14_recipes, ff14_items, browseLimit);
            return res.json({ recipes });
        }
        if (safe.length < 2) {
            return res.json({ recipes: [] });
        }
        const { recipes } = searchRecipesInCache(ff14_recipes, ff14_items, q, limit);
        res.json({ recipes });
    } catch (error) {
        console.error('[api/recipes/search]', error);
        res.status(500).json({ error: 'Erreur lors de la recherche locale.' });
    }
});

app.get('/api/recipe/:id', (req, res) => {
    try {
        const recipeId = Number.parseInt(req.params.id, 10);
        if (!Number.isFinite(recipeId) || recipeId <= 0) {
            return res.status(400).json({ error: 'ID recette invalide.' });
        }
        if (!ff14_recipes || !ff14_items) {
            return res.status(503).json({ error: 'Caches non prets.' });
        }
        const detail = formatRecipeDetailFromCache(recipeId, ff14_recipes, ff14_items);
        if (!detail) {
            return res.status(404).json({ error: 'Recette introuvable.' });
        }
        res.json(detail);
    } catch (error) {
        console.error('[api/recipe/:id]', error);
        res.status(500).json({ error: 'Erreur lors de la lecture de la recette.' });
    }
});

app.get('/api/macro-translate-status', (req, res) => {
    try {
        res.json(getMacroDictionaryStatePayload());
    } catch (error) {
        console.error('[api/macro-translate-status] Erreur:', error);
        res.status(500).json({ error: 'Erreur serveur.' });
    }
});

app.post('/api/macro-translate', (req, res) => {
    try {
        if (actionDictionaryPhase !== 'ready') {
            const payload = getMacroDictionaryStatePayload();
            if (actionDictionaryPhase === 'loading') {
                return res.status(503).json({
                    error: 'Le dictionnaire des sorts est encore en cours de chargement. Reessaie dans quelques instants.',
                    ...payload
                });
            }
            if (actionDictionaryPhase === 'error') {
                return res.status(503).json({
                    error: payload.error || 'Le dictionnaire des sorts n\'a pas pu etre charge. Redemarre le serveur ou supprime data-files/actions_cache.json si le fichier est corrompu.',
                    ...payload
                });
            }
            return res.status(503).json({
                error: 'Le dictionnaire des sorts n\'est pas encore pret.',
                ...payload
            });
        }

        const text = typeof req.body?.text === 'string' ? req.body.text : '';
        const translated = translateMacroSkillNames(text);
        res.json({
            translated,
            entryCount: Object.keys(actionTranslateByEn || {}).length,
            ...getMacroDictionaryStatePayload()
        });
    } catch (error) {
        console.error('[api/macro-translate] Erreur:', error);
        res.status(500).json({ error: 'Erreur lors de la traduction.' });
    }
});

app.get('/api/top-items', (req, res) => {
    try {
        scheduleTopItemsRefreshIfNeeded(false);
        const snap = peekTopItemsSnapshot();
        res.json({
            lastRefreshedAt: snap.lastRefreshedAt,
            refreshPending: snap.refreshPending,
            refreshIntervalMinutes: TOP_ITEMS_REFRESH_MS / 60000,
            topItems: snap.topItems,
            updatedItemsCount: snap.updatedItemsCount,
            uniqueItemsCount: snap.uniqueItemsCount,
            trackedItemsCount: snap.trackedItemsCount,
            generatedAt: snap.generatedAt
        });
    } catch (error) {
        console.error('[api/top-items] Erreur:', error);
        res.status(500).json({ error: 'Erreur lors de la recuperation des top items.' });
    }
});

app.get('/api/market-detail', async (req, res) => {
    try {
        const payload = await buildMarketDetailPayload(req.query["ids"]);
        if (payload.error) {
            return res.status(payload.status).json({ error: payload.error });
        }
        res.json(payload);
    } catch (error) {
        console.error('[api/market-detail] Erreur:', error);
        res.status(500).json({ error: "Erreur lors de la recuperation des donnees de marche." });
    }
});


setImmediate(() => {
    startActionDictionaryBackgroundLoad().catch(err => {
        console.error('[actions] Erreur inattendue chargement arrière-plan:', err);
    });
});

const server = app.listen(port, () => {
    console.log(`Serveur démarré sur http://localhost:${port}`);
});

server.on('error', (error) => {
    if (error && error.code === 'EADDRINUSE') {
        console.error(`[server] Le port ${port} est deja utilise. Ferme l'autre serveur ou lance avec PORT=3001 npm start`);
        process.exit(1);
    }
    console.error('[server] Erreur au demarrage:', error);
    process.exit(1);
});

setInterval(() => {
    getTopItemsData({ forceRefresh: true }).catch(error => {
        console.error('[top-items-cache] Erreur refresh auto:', error);
    });
}, TOP_ITEMS_REFRESH_MS);