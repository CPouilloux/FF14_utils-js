const fs = require('fs');
const path = require('path');

const MARKET_SERVERS_CONFIG_FILE = path.join('data-files', 'market_servers_config.json');

const MARKET_WORLD_GROUPS = [
    {
        datacenterId: 'chaos',
        datacenterName: 'Chaos (Europe)',
        worlds: [
            { id: '39', name: 'Omega' },
            { id: '71', name: 'Moogle' },
            { id: '80', name: 'Cerberus' },
            { id: '83', name: 'Louisoix' },
            { id: '85', name: 'Spriggan' },
            { id: '97', name: 'Ragnarok' },
            { id: '400', name: 'Sagittarius' },
            { id: '401', name: 'Phantom' }
        ]
    },
    {
        datacenterId: 'light',
        datacenterName: 'Light (Europe)',
        worlds: [
            { id: '33', name: 'Twintania' },
            { id: '36', name: 'Lich' },
            { id: '42', name: 'Zodiark' },
            { id: '56', name: 'Phoenix' },
            { id: '66', name: 'Odin' },
            { id: '67', name: 'Shiva' },
            { id: '402', name: 'Alpha' },
            { id: '403', name: 'Raiden' }
        ]
    },
    {
        datacenterId: 'materia',
        datacenterName: 'Materia (Océanie)',
        worlds: [
            { id: '21', name: 'Ravana' },
            { id: '22', name: 'Bismarck' },
            { id: '86', name: 'Sephirot' },
            { id: '87', name: 'Sophia' },
            { id: '88', name: 'Zurvan' }
        ]
    }
];

function ensureDataDir() {
    const dir = path.dirname(MARKET_SERVERS_CONFIG_FILE);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function buildWorldIndexes() {
    const byId = {};
    MARKET_WORLD_GROUPS.forEach((group) => {
        group.worlds.forEach((world) => {
            byId[world.id] = {
                id: world.id,
                name: world.name,
                datacenterId: group.datacenterId,
                datacenterName: group.datacenterName
            };
        });
    });
    return byId;
}

const WORLDS_BY_ID = buildWorldIndexes();
const ALL_WORLD_IDS = Object.keys(WORLDS_BY_ID);

function defaultConfig() {
    return {
        mainWorldId: '71',
        secondaryWorldIds: ['39', '80', '83', '85', '97', '400', '401']
    };
}

function sanitizeConfig(rawConfig) {
    const rawMain = rawConfig && rawConfig.mainWorldId != null ? String(rawConfig.mainWorldId).trim() : '';
    const rawSecondary = Array.isArray(rawConfig?.secondaryWorldIds) ? rawConfig.secondaryWorldIds : [];
    const secondarySet = new Set(
        rawSecondary
            .map((id) => String(id).trim())
            .filter((id) => Object.prototype.hasOwnProperty.call(WORLDS_BY_ID, id))
    );

    let mainWorldId = rawMain;
    if (!Object.prototype.hasOwnProperty.call(WORLDS_BY_ID, mainWorldId)) {
        mainWorldId = defaultConfig().mainWorldId;
    }
    secondarySet.delete(mainWorldId);

    return {
        mainWorldId,
        secondaryWorldIds: Array.from(secondarySet).sort((a, b) => Number(a) - Number(b))
    };
}

function loadMarketServersConfig() {
    try {
        if (!fs.existsSync(MARKET_SERVERS_CONFIG_FILE)) {
            const cfg = defaultConfig();
            saveMarketServersConfig(cfg);
            return cfg;
        }
        const raw = fs.readFileSync(MARKET_SERVERS_CONFIG_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        const cfg = sanitizeConfig(parsed);
        return cfg;
    } catch (error) {
        console.error('[market-servers-config] Erreur lecture:', error);
        return defaultConfig();
    }
}

function saveMarketServersConfig(config) {
    ensureDataDir();
    const safe = sanitizeConfig(config);
    fs.writeFileSync(MARKET_SERVERS_CONFIG_FILE, JSON.stringify(safe, null, 2), 'utf8');
    return safe;
}

function buildGroupedWorldsForView(currentConfig) {
    const cfg = sanitizeConfig(currentConfig);
    const selectedSecondary = new Set(cfg.secondaryWorldIds);
    return MARKET_WORLD_GROUPS.map((group) => ({
        datacenterId: group.datacenterId,
        datacenterName: group.datacenterName,
        worlds: group.worlds.map((world) => ({
            id: world.id,
            name: world.name,
            isMain: cfg.mainWorldId === world.id,
            isSecondary: selectedSecondary.has(world.id)
        }))
    }));
}

function getMarketWorldById(worldId) {
    return WORLDS_BY_ID[String(worldId)] || null;
}

function buildDatacentersToQuery(config) {
    const cfg = sanitizeConfig(config);
    const selectedIds = [cfg.mainWorldId, ...cfg.secondaryWorldIds];
    const dcSet = new Set();
    selectedIds.forEach((id) => {
        const world = getMarketWorldById(id);
        if (world) {
            dcSet.add(world.datacenterId);
        }
    });
    return Array.from(dcSet);
}

module.exports = {
    MARKET_SERVERS_CONFIG_FILE,
    ALL_WORLD_IDS,
    defaultConfig,
    loadMarketServersConfig,
    saveMarketServersConfig,
    sanitizeConfig,
    buildGroupedWorldsForView,
    getMarketWorldById,
    buildDatacentersToQuery
};
