/**
 * Recherche et formatage des recettes à partir du cache local (recipes_cache.json).
 * Le téléchargement XIVAPI est géré par recuperation_recipes.js.
 */

function sanitizeSearchFragment(q) {
    return String(q || '')
        .trim()
        .slice(0, 80)
        .replace(/\\/g, '')
        .replace(/"/g, '');
}

/** Évite les faux positifs type « hachette » dans « Ex-hachette ». */
function itemNameMatchesQuery(nameFr, nameEn, qlow) {
    const ne = String(nameEn || '').toLowerCase();
    if (ne.includes(qlow)) {
        return true;
    }
    const nf = String(nameFr || '').toLowerCase();
    const idx = nf.indexOf(qlow);
    if (idx < 0) {
        return false;
    }
    if (idx === 0) {
        return true;
    }
    const prev = nf[idx - 1];
    return !/[a-zà-ÿ]/i.test(prev);
}

function compareByResultItemIdThenRecipe(a, b) {
    const sa = String(a.resultItemId ?? '');
    const sb = String(b.resultItemId ?? '');
    const na = Number.parseInt(sa, 10);
    const nb = Number.parseInt(sb, 10);
    if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) {
        return na - nb;
    }
    const idCmp = sa.localeCompare(sb, undefined, { numeric: true });
    if (idCmp !== 0) {
        return idCmp;
    }
    return (a.recipeId || 0) - (b.recipeId || 0);
}

/**
 * @param {Record<string, object>} recipesMap
 * @param {Record<string, { name_en?: string, name_fr?: string }>} itemsById
 * @param {string} q
 * @param {number} limit
 * @returns {{ recipes: object[] }}
 */
function searchRecipesInCache(recipesMap, itemsById, q, limit) {
    const safe = sanitizeSearchFragment(q);
    if (safe.length < 2 || !recipesMap || !itemsById) {
        return { recipes: [] };
    }
    const qlow = safe.toLowerCase();
    const hits = [];

    for (const [recipeId, rec] of Object.entries(recipesMap)) {
        if (!rec || !rec.resultItemId) {
            continue;
        }
        const it = itemsById[rec.resultItemId];
        const nameEn = it ? it.name_en : '';
        const nameFr = it ? it.name_fr : '';
        if (!itemNameMatchesQuery(nameFr, nameEn, qlow)) {
            continue;
        }
        hits.push({
            recipeId: Number(recipeId),
            resultItemId: rec.resultItemId,
            nameEn: nameEn || '',
            nameFr: nameFr || '',
            level: rec.level,
            craftType: rec.craftType || '',
            amountResult: rec.amountResult != null ? rec.amountResult : 1
        });
    }

    hits.sort(compareByResultItemIdThenRecipe);
    const recipes = hits.slice(0, limit);
    return { recipes };
}

/**
 * Premières recettes du cache, triées par ID d’objet résultat (puis ID recette) pour l’aperçu sans requête.
 * @param {Record<string, object>} recipesMap
 * @param {Record<string, { name_en?: string, name_fr?: string }>} itemsById
 * @param {number} limit
 * @returns {object[]}
 */
function browseRecipesInCache(recipesMap, itemsById, limit) {
    if (!recipesMap || !itemsById || limit <= 0) {
        return [];
    }
    const rows = [];
    for (const [recipeId, rec] of Object.entries(recipesMap)) {
        if (!rec || !rec.resultItemId) {
            continue;
        }
        const it = itemsById[rec.resultItemId];
        const nameEn = it ? it.name_en : '';
        const nameFr = it ? it.name_fr : '';
        rows.push({
            recipeId: Number(recipeId),
            resultItemId: rec.resultItemId,
            nameEn: nameEn || '',
            nameFr: nameFr || '',
            level: rec.level,
            craftType: rec.craftType || '',
            amountResult: rec.amountResult != null ? rec.amountResult : 1
        });
    }
    rows.sort(compareByResultItemIdThenRecipe);
    return rows.slice(0, limit);
}

/**
 * @param {string|number} recipeId
 * @param {Record<string, object>} recipesMap
 * @param {Record<string, { name_en?: string, name_fr?: string }>} itemsById
 */
function formatRecipeDetailFromCache(recipeId, recipesMap, itemsById) {
    const rec = recipesMap[String(recipeId)];
    if (!rec) {
        return null;
    }
    const result = itemsById[rec.resultItemId];
    const ingredients = [];
    const ids = rec.ingredientIds || [];
    const amts = rec.ingredientAmounts || [];
    for (let i = 0; i < ids.length; i++) {
        const sid = String(ids[i]);
        const it = itemsById[sid];
        ingredients.push({
            itemId: sid,
            amount: amts[i] != null ? amts[i] : 1,
            nameEn: it ? it.name_en : `#${sid}`,
            nameFr: it ? it.name_fr : `#${sid}`
        });
    }
    return {
        recipeId: Number(recipeId),
        resultItemId: rec.resultItemId,
        nameEn: result ? result.name_en : '',
        nameFr: result ? result.name_fr : '',
        amountResult: rec.amountResult != null ? rec.amountResult : 1,
        craftType: rec.craftType || '',
        level: rec.level != null ? rec.level : null,
        ingredients
    };
}

module.exports = {
    sanitizeSearchFragment,
    itemNameMatchesQuery,
    searchRecipesInCache,
    browseRecipesInCache,
    formatRecipeDetailFromCache
};
