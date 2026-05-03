document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('craftSearchInput');
    const hint = document.getElementById('craftSearchHint');
    const tbody = document.getElementById('craftResultsBody');
    const detailEmpty = document.getElementById('craftDetailEmpty');
    const detailContent = document.getElementById('craftDetailContent');
    let selectedRow = null;
    let lastController = null;

    function escapeHtml(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function debounce(fn, delay) {
        let t;
        return (...args) => {
            clearTimeout(t);
            t = setTimeout(() => fn.apply(null, args), delay);
        };
    }

    function renderPlaceholder(msg) {
        tbody.innerHTML = `<tr class="craft-placeholder-row"><td colspan="5">${escapeHtml(msg)}</td></tr>`;
    }

    function renderResults(recipes) {
        if (!recipes.length) {
            renderPlaceholder('Aucune recette trouvée pour cette recherche.');
            return;
        }
        const rid = (r) => escapeHtml(String(r.resultItemId != null ? r.resultItemId : ''));
        tbody.innerHTML = recipes
            .map(
                (r) => `
      <tr data-recipe-id="${escapeHtml(String(r.recipeId))}">
        <td></td>
        <td class="favorite-col">${
            /^\d+$/.test(String(r.resultItemId))
                ? `<button type="button" class="item-favorite-btn" data-item-id="${rid(r)}" aria-label="Ajouter aux favoris" aria-pressed="false">☆</button>`
                : ''
        }</td>
        <td><div class="item_id">${escapeHtml(String(r.resultItemId != null ? r.resultItemId : '—'))}</div></td>
        <td><div class="name_fr">${escapeHtml(r.nameFr || '')}</div></td>
        <td><div class="name_en">${escapeHtml(r.nameEn || '')}</div></td>
      </tr>`
            )
            .join('');
        if (window.ItemFavorites && typeof window.ItemFavorites.resync === 'function') {
            window.ItemFavorites.resync();
        }
    }

    async function runSearch() {
        const q = (input?.value || '').trim();
        if (q.length === 1) {
            if (hint) {
                hint.textContent = '';
            }
            renderPlaceholder('Tape au moins 2 caractères pour filtrer la liste.');
            return;
        }
        if (lastController) {
            lastController.abort();
        }
        lastController = new AbortController();
        const { signal } = lastController;
        if (hint) {
            hint.textContent = q.length >= 2 ? 'Recherche en cours…' : 'Chargement…';
        }
        try {
            const url =
                q.length >= 2
                    ? `/api/recipes/search?q=${encodeURIComponent(q)}`
                    : '/api/recipes/search';
            const res = await fetch(url, { signal });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data.error || `Erreur ${res.status}`);
            }
            const list = data.recipes || [];
            renderResults(list);
            if (hint) {
                const n = list.length;
                hint.textContent =
                    q.length >= 2
                        ? `${n} résultat(s).`
                        : n
                          ? `Aperçu : ${n} recette(s) — tape un nom pour affiner.`
                          : 'Aucune recette dans le cache.';
            }
            selectedRow = null;
            detailContent.classList.add('hidden');
            detailEmpty.classList.remove('hidden');
        } catch (e) {
            if (e.name === 'AbortError') {
                return;
            }
            if (hint) {
                hint.textContent = '';
            }
            renderPlaceholder(e.message || 'Erreur réseau.');
        }
    }

    const debouncedSearch = debounce(runSearch, 450);

    if (input) {
        input.addEventListener('input', debouncedSearch);
    }

    tbody.addEventListener('click', async (e) => {
        if (e.target.closest('.item-favorite-btn')) {
            return;
        }
        const tr = e.target.closest('tr[data-recipe-id]');
        if (!tr) {
            return;
        }
        const id = tr.getAttribute('data-recipe-id');
        if (!id) {
            return;
        }
        if (selectedRow) {
            selectedRow.classList.remove('is-selected');
        }
        selectedRow = tr;
        tr.classList.add('is-selected');

        detailEmpty.classList.add('hidden');
        detailContent.classList.remove('hidden');
        detailContent.innerHTML = '<p class="craft-hint">Chargement…</p>';

        try {
            const res = await fetch(`/api/recipe/${encodeURIComponent(id)}`);
            const d = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(d.error || `Erreur ${res.status}`);
            }
            const resultItemIdStr = String(d.resultItemId != null ? d.resultItemId : '').trim();
            const resultStar =
                /^\d+$/.test(resultItemIdStr)
                    ? `<button type="button" class="item-favorite-btn" data-item-id="${escapeHtml(
                          resultItemIdStr
                      )}" aria-label="Ajouter aux favoris" aria-pressed="false">☆</button>`
                    : '';
            const lines = (d.ingredients || [])
                .map((ing) => {
                    const iid = String(ing.itemId != null ? ing.itemId : '').trim();
                    const star =
                        /^\d+$/.test(iid)
                            ? `<button type="button" class="item-favorite-btn" data-item-id="${escapeHtml(
                                  iid
                              )}" aria-label="Ajouter aux favoris" aria-pressed="false">☆</button>`
                            : '';
                    return `<li class="craft-ingredient-line">${star}<span class="craft-ingredient-text"><strong>${escapeHtml(
                        ing.nameFr || ing.nameEn
                    )}</strong> × ${escapeHtml(String(ing.amount))} <span class="craft-result-sub">(${escapeHtml(
                        ing.nameEn || ''
                    )} · #${escapeHtml(ing.itemId)})</span></span></li>`;
                })
                .join('');
            const resultId = String(d.resultItemId != null ? d.resultItemId : '').trim();
            const seen = new Set();
            const marketIdsOrdered = [];
            if (/^\d+$/.test(resultId)) {
                seen.add(resultId);
                marketIdsOrdered.push(resultId);
            }
            for (const ing of d.ingredients || []) {
                const iid = String(ing.itemId != null ? ing.itemId : '').trim();
                if (!/^\d+$/.test(iid) || seen.has(iid)) {
                    continue;
                }
                seen.add(iid);
                marketIdsOrdered.push(iid);
            }
            const marketUrl = `/marketDetail?ids=${encodeURIComponent(marketIdsOrdered.join(','))}`;
            const marketBtn =
                marketIdsOrdered.length > 0
                    ? `<a class="btn btn-success craft-link-market" href="${marketUrl}" target="_blank" rel="noopener">Voir les prix (objet crafté + ingrédients)</a>`
                    : `<span class="btn btn-secondary craft-link-market" aria-disabled="true">Voir les prix (IDs indisponibles)</span>`;
            detailContent.innerHTML = `
        <div class="craft-detail-heading-row">${resultStar}<h3 class="craft-result-title">${escapeHtml(
                d.nameFr || d.nameEn
            )}</h3></div>
        <p class="craft-result-sub">${escapeHtml(d.nameEn || '')}</p>
        <p class="craft-meta-line">Niveau ${d.level != null ? escapeHtml(String(d.level)) : '—'} · ${escapeHtml(
                d.craftType || ''
            )} · résultat × ${escapeHtml(String(d.amountResult != null ? d.amountResult : 1))}</p>
        <h4 class="craft-ingredients-title">Ingrédients</h4>
        <ul class="craft-ingredients craft-ingredients-fav">${lines || '<li>Aucun ingrédient listé.</li>'}</ul>
        ${marketBtn}
      `;
            if (window.ItemFavorites && typeof window.ItemFavorites.resync === 'function') {
                window.ItemFavorites.resync();
            }
        } catch (err) {
            detailContent.innerHTML = `<p class="craft-hint">${escapeHtml(err.message || 'Erreur')}</p>`;
        }
    });

    const initial = typeof window.__CRAFT_INITIAL_Q__ === 'string' ? window.__CRAFT_INITIAL_Q__ : '';
    if (input && initial.trim().length >= 2) {
        input.value = initial;
    }
    void runSearch();
});
