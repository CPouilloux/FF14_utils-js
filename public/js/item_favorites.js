(function () {
    const API_LIST = '/api/item-favorites';
    const API_TOGGLE = '/api/item-favorites/toggle';

    /** @type {Set<string>|null} */
    let favoriteIds = null;
    /** @type {Promise<Set<string>>|null} */
    let loadingPromise = null;

    function applyVisualToButton(btn, on) {
        btn.classList.toggle('item-favorite-btn--on', on);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        btn.setAttribute('aria-label', on ? 'Retirer des favoris' : 'Ajouter aux favoris');
        btn.textContent = on ? '★' : '☆';
    }

    function refreshAllButtons() {
        if (!favoriteIds) {
            return;
        }
        document.querySelectorAll('.item-favorite-btn').forEach((btn) => {
            const id = btn.getAttribute('data-item-id');
            if (!id) {
                return;
            }
            applyVisualToButton(btn, favoriteIds.has(id));
        });
    }

    function setFromList(ids) {
        favoriteIds = new Set(
            (ids || [])
                .map((x) => String(x).trim())
                .filter((id) => /^\d+$/.test(id))
        );
    }

    function ensureLoaded() {
        if (favoriteIds) {
            return Promise.resolve(favoriteIds);
        }
        if (loadingPromise) {
            return loadingPromise;
        }
        loadingPromise = fetch(API_LIST)
            .then((r) => {
                if (!r.ok) {
                    throw new Error('bad');
                }
                return r.json();
            })
            .then((data) => {
                setFromList(data.ids);
                loadingPromise = null;
                return favoriteIds;
            })
            .catch(() => {
                favoriteIds = new Set();
                loadingPromise = null;
                return favoriteIds;
            });
        return loadingPromise;
    }

    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.item-favorite-btn');
        if (!btn) {
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        const itemId = btn.getAttribute('data-item-id');
        if (!itemId || !/^\d+$/.test(itemId)) {
            return;
        }
        (async () => {
            try {
                await ensureLoaded();
                const res = await fetch(API_TOGGLE, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ itemId })
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                    return;
                }
                if (data.favorite) {
                    favoriteIds.add(String(itemId));
                } else {
                    favoriteIds.delete(String(itemId));
                }
                document.querySelectorAll(`.item-favorite-btn[data-item-id="${itemId}"]`).forEach((b) => {
                    applyVisualToButton(b, Boolean(data.favorite));
                });
                if (!data.favorite && window.location.pathname === '/favorites') {
                    document
                        .querySelectorAll(`tr[data-favorite-row][data-item-id="${itemId}"]`)
                        .forEach((tr) => tr.remove());
                    const tb = document.getElementById('favoritesTableBody');
                    if (tb && tb.querySelectorAll('tr').length === 0) {
                        tb.innerHTML =
                            '<tr class="favorite-empty-row"><td colspan="5">Aucun favori pour le moment. Ajoute-en depuis la liste des objets ou les pages craft.</td></tr>';
                    }
                    if (typeof window.__favoritesAfterDomChange === 'function') {
                        window.__favoritesAfterDomChange(itemId);
                    }
                }
            } catch {
                /* ignore */
            }
        })();
    });

    document.addEventListener('DOMContentLoaded', () => {
        ensureLoaded().then(() => refreshAllButtons());
    });

    window.ItemFavorites = {
        resync() {
            ensureLoaded().then(() => refreshAllButtons());
        },
        ensureLoaded
    };
})();
