const recuperationItemsFromFiles = require("./src/recuperation_items");
const {retrive_market_data, get_server_data} = require("./src/requete_market");
const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const port = 3000;
const SAVED_SEARCHES_FILE = path.join('data-files', 'saved_searches.json');

app.use(express.static('public'));
app.set('view engine', 'ejs');
app.use(express.json());

let ff14_items;


async function init() {
    if (!ff14_items) {
        ff14_items = await recuperationItemsFromFiles();
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

init();

app.get('/', (req, res) => {
    const qFr = normalizeText(req.query.qFr);
    const qEn = normalizeText(req.query.qEn);
    const page = parsePositiveInt(req.query.page, 1);
    const perPage = Math.min(parsePositiveInt(req.query.perPage, 200), 500);

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

    res.render('index', {
        data: pagedItems,
        qFr,
        qEn,
        page: safePage,
        perPage,
        totalItems,
        totalPages,
        savedSearches: loadSavedSearches()
    });
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

app.get('/marketDetail', async (req, res) => {
    try {
        const ids_param = req.query["ids"];
        if (parseIdsParam(ids_param).length === 0) {
            return res.status(400).send("Parametre ids invalide. Exemple: /marketDetail?ids=5333,5334");
        }
        res.render('marketDetail', {
            ids_param: parseIdsParam(ids_param).join(","),
            savedSearches: loadSavedSearches()
        });
    } catch (error) {
        console.error('[marketDetail] Erreur:', error);
        res.status(500).send("Erreur lors de la recuperation des donnees de marche.");
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


app.listen(port, () => {
    console.log(`Serveur démarré sur http://localhost:${port}`);
});