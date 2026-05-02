document.addEventListener('DOMContentLoaded', () => {
    const table = document.querySelector('.top-items-table');
    const overlay = document.getElementById('topItemsLoadingOverlay');
    if (!table) {
        return;
    }

    const tbody = table.querySelector('tbody');
    if (!tbody) {
        return;
    }

    let currentSortKey = 'velocity';
    let currentSortDirection = 'desc';

    const sortAccessors = {
        name: row => row.dataset.sortName || '',
        velocity: row => Number(row.dataset.sortVelocity || 0),
        avgPrice: row => Number(row.dataset.sortAvgPrice || 0),
        minPrice: row => Number(row.dataset.sortMinPrice || 0),
        listings: row => Number(row.dataset.sortListings || 0)
    };

    function compareValues(a, b, direction) {
        if (typeof a === 'string' || typeof b === 'string') {
            const cmp = String(a).localeCompare(String(b), 'fr');
            return direction === 'asc' ? cmp : -cmp;
        }
        const cmp = a - b;
        return direction === 'asc' ? cmp : -cmp;
    }

    function updateHeaderState() {
        const headers = Array.from(table.querySelectorAll('.sortable-header'));
        headers.forEach(header => {
            const key = header.dataset.sortKey;
            const indicator = header.querySelector('.sort-indicator');
            header.classList.remove('sorted-asc', 'sorted-desc');
            if (key === currentSortKey) {
                header.classList.add(currentSortDirection === 'asc' ? 'sorted-asc' : 'sorted-desc');
                if (indicator) {
                    indicator.textContent = currentSortDirection === 'asc' ? '▲' : '▼';
                }
            } else if (indicator) {
                indicator.textContent = '';
            }
        });
    }

    function sortRows(sortKey, sortDirection) {
        const rows = Array.from(tbody.querySelectorAll('tr.clickable-row'));
        const accessor = sortAccessors[sortKey];
        if (!accessor) {
            return;
        }

        rows.sort((rowA, rowB) => {
            const valA = accessor(rowA);
            const valB = accessor(rowB);
            return compareValues(valA, valB, sortDirection);
        });

        rows.forEach(row => tbody.appendChild(row));
    }

    function escapeHtml(value) {
        return String(value)
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    }

    function formatDateTimeFr(iso) {
        if (!iso) {
            return 'Jamais';
        }
        return new Date(iso).toLocaleString('fr-FR');
    }

    function buildRowsHtml(rows) {
        if (!rows || rows.length === 0) {
            return '<tr><td colspan="5" class="empty-state">Aucune donnee disponible.</td></tr>';
        }
        return rows.map((row) => {
            const nameFr = escapeHtml(row.name_fr || '');
            const itemId = escapeHtml(row.itemId);
            const sortName = escapeHtml((row.name_fr || '').toLowerCase());
            const vel = Number(row.regularSaleVelocity || 0);
            const avg = Math.round(Number(row.averagePrice || 0)).toLocaleString('fr-FR');
            const min = Math.round(Number(row.minPrice || 0)).toLocaleString('fr-FR');
            const listings = Math.round(Number(row.listingsCount || 0)).toLocaleString('fr-FR');
            return `<tr class="clickable-row" data-item-id="${itemId}" data-sort-name="${sortName}" data-sort-velocity="${vel}" data-sort-avg-price="${row.averagePrice}" data-sort-min-price="${row.minPrice}" data-sort-listings="${row.listingsCount}">
                <td>${nameFr} <span class="item-id">(#${itemId})</span></td>
                <td>${vel.toFixed(2)}</td>
                <td>${avg} gils</td>
                <td>${min} gils</td>
                <td>${listings}</td>
            </tr>`;
        }).join('');
    }

    function setOverlayVisible(visible) {
        if (!overlay) {
            return;
        }
        if (visible) {
            overlay.classList.remove('hidden');
        } else {
            overlay.classList.add('hidden');
        }
    }

    function applyTopItemsApiPayload(data) {
        const lastRefreshEl = document.getElementById('topItemsLastRefresh');
        const trackedEl = document.getElementById('topItemsTrackedCount');
        const uniqueEl = document.getElementById('topItemsUniqueCount');
        const updatedEl = document.getElementById('topItemsUpdatedCount');

        if (lastRefreshEl) {
            lastRefreshEl.textContent = formatDateTimeFr(data.lastRefreshedAt);
        }
        if (trackedEl && typeof data.trackedItemsCount === 'number') {
            trackedEl.textContent = String(data.trackedItemsCount);
        }
        if (uniqueEl && typeof data.uniqueItemsCount === 'number') {
            uniqueEl.textContent = String(data.uniqueItemsCount);
        }
        if (updatedEl && typeof data.updatedItemsCount === 'number') {
            updatedEl.textContent = String(data.updatedItemsCount);
        }

        tbody.innerHTML = buildRowsHtml(data.topItems);
        sortRows(currentSortKey, currentSortDirection);
        updateHeaderState();
        const hasRows = Array.isArray(data.topItems) && data.topItems.length > 0;
        const showOverlay = Boolean(data.refreshPending && !hasRows);
        setOverlayVisible(showOverlay);
    }

    table.addEventListener('click', (event) => {
        const header = event.target.closest('.sortable-header');
        if (header && table.contains(header)) {
            const sortKey = header.dataset.sortKey;
            if (!sortKey) {
                return;
            }

            if (sortKey === currentSortKey) {
                currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                currentSortKey = sortKey;
                currentSortDirection = sortKey === 'name' ? 'asc' : 'desc';
            }

            sortRows(currentSortKey, currentSortDirection);
            updateHeaderState();
            return;
        }

        const row = event.target.closest('tr.clickable-row');
        if (row && tbody.contains(row)) {
            const itemId = row.dataset.itemId;
            if (!itemId) {
                return;
            }
            window.location.href = `/marketDetail?ids=${encodeURIComponent(itemId)}`;
        }
    });

    updateHeaderState();

    const client = window.__TOP_ITEMS__;
    if (!client || !client.refreshPending) {
        return;
    }

    const pollMs = 2000;
    const pollTimer = setInterval(async () => {
        try {
            const res = await fetch('/api/top-items');
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || `HTTP ${res.status}`);
            }
            applyTopItemsApiPayload(data);
            if (!data.refreshPending) {
                clearInterval(pollTimer);
            }
        } catch {
            /* on garde l'overlay et on reessaie au prochain tick */
        }
    }, pollMs);
});
