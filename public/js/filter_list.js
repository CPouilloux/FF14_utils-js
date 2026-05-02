document.addEventListener('DOMContentLoaded', () => {
    const filtersForm = document.getElementById('filtersForm');
    const filterInputFr = document.getElementById('filterInputFr');
    const filterInputEn = document.getElementById('filterInputEn');
    const perPageSelect = document.getElementById('perPageSelect');
    const dataTable = document.getElementById('dataTable');
    const checkedIdsDiv = document.getElementById('checkedIds');
    const checkAllBtn = document.getElementById('checkAllBtn');
    const uncheckAllBtn = document.getElementById('uncheckAllBtn');
    const openInNewTabBtn = document.getElementById('openInNewTabBtn');
    const saveSearchBtn = document.getElementById('saveSearchBtn');
    const savedSearchNameInput = document.getElementById('savedSearchNameInput');
    const savedSearchesList = document.getElementById('savedSearchesList');

    /** IDs sélectionnés sur toutes les pages / recherches (pas effacés au filtrage). */
    const selectedIds = new Set();

    let listMeta = window.__INDEX_LIST_META__ || {
        page: 1,
        totalPages: 1,
        totalItems: 0,
        perPage: 200
    };

    function escapeHtml(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function getSelectedIdsSorted() {
        return Array.from(selectedIds).sort((a, b) => Number(a) - Number(b));
    }

    function refreshSelectionDisplay() {
        const ids = getSelectedIdsSorted();
        checkedIdsDiv.textContent = ids.length > 0 ? ids.join(', ') : 'Aucun item sélectionné.';
        return ids;
    }

    function syncCheckboxIntoSet(checkbox) {
        const id = checkbox.getAttribute('data-id');
        if (!id) {
            return;
        }
        if (checkbox.checked) {
            selectedIds.add(id);
        } else {
            selectedIds.delete(id);
        }
        refreshSelectionDisplay();
    }

    function syncCheckboxesFromSet() {
        dataTable.querySelectorAll('.itemCheckbox').forEach((cb) => {
            const id = cb.getAttribute('data-id');
            cb.checked = selectedIds.has(id);
        });
    }

    function renderRows(items) {
        const tbody = document.getElementById('itemsTableBody');
        if (!tbody) {
            return;
        }
        tbody.innerHTML = items
            .map(
                (item) => `
        <tr>
          <td><input type="checkbox" class="itemCheckbox" data-id="${escapeHtml(item.id)}"></td>
          <td><div class="item_id" data-checkbox-id="${escapeHtml(item.id)}">${escapeHtml(item.id)}</div></td>
          <td><div class="name_fr" data-checkbox-id="${escapeHtml(item.id)}">${escapeHtml(item.name_fr)}</div></td>
          <td><div class="name_en" data-checkbox-id="${escapeHtml(item.id)}">${escapeHtml(item.name_en)}</div></td>
        </tr>`
            )
            .join('');
        syncCheckboxesFromSet();
    }

    function updatePaginationFromJson(json) {
        listMeta = {
            page: json.page,
            totalPages: json.totalPages,
            totalItems: json.totalItems,
            perPage: json.perPage
        };
        const totalEl = document.getElementById('paginationTotal');
        const pageEl = document.getElementById('paginationPage');
        const actions = document.getElementById('paginationActions');
        if (totalEl) {
            totalEl.textContent = `${json.totalItems} résultats`;
        }
        if (pageEl) {
            pageEl.textContent = `Page ${json.page} / ${json.totalPages}`;
        }
        if (actions) {
            const prevPage = json.page > 1 ? json.page - 1 : 1;
            const nextPage = json.page < json.totalPages ? json.page + 1 : json.totalPages;
            actions.innerHTML = `
        <button type="button" class="page-link ${json.page === 1 ? 'disabled' : ''}" data-nav-page="${prevPage}">Précédent</button>
        <button type="button" class="page-link ${json.page === json.totalPages ? 'disabled' : ''}" data-nav-page="${nextPage}">Suivant</button>`;
        }
        refreshCheckAllState(json.items.length);
    }

    function refreshCheckAllState(rowCount) {
        if (!checkAllBtn) {
            return;
        }
        const canSelectAll = rowCount <= 20;
        checkAllBtn.disabled = !canSelectAll;
        checkAllBtn.title = canSelectAll
            ? ''
            : 'Disponible uniquement quand 20 lignes max sont affichées.';
    }

    async function loadItems(page, options = {}) {
        const { skipPushState = false } = options;
        const params = new URLSearchParams();
        const qFr = (filterInputFr?.value || '').trim();
        const qEn = (filterInputEn?.value || '').trim();
        if (qFr) {
            params.set('qFr', qFr);
        }
        if (qEn) {
            params.set('qEn', qEn);
        }
        params.set('perPage', perPageSelect?.value || '200');
        params.set('page', String(page));

        const res = await fetch(`/api/items?${params.toString()}`);
        if (!res.ok) {
            throw new Error('Chargement de la liste impossible.');
        }
        const json = await res.json();
        renderRows(json.items);
        updatePaginationFromJson(json);
        if (!skipPushState) {
            const qs = params.toString();
            history.pushState({ page: json.page }, '', qs ? `/?${qs}` : '/');
        }
    }

    function toggleCheckbox(checkboxId) {
        const checkbox = document.querySelector(`.itemCheckbox[data-id="${checkboxId}"]`);
        if (checkbox) {
            checkbox.checked = !checkbox.checked;
            syncCheckboxIntoSet(checkbox);
        }
    }

    dataTable.addEventListener('change', (e) => {
        if (!e.target.classList.contains('itemCheckbox')) {
            return;
        }
        syncCheckboxIntoSet(e.target);
    });

    if (checkAllBtn) {
        refreshCheckAllState(dataTable.querySelectorAll('.itemCheckbox').length);
        checkAllBtn.addEventListener('click', () => {
            if (checkAllBtn.disabled) {
                return;
            }
            dataTable.querySelectorAll('.itemCheckbox').forEach((checkbox) => {
                checkbox.checked = true;
                const id = checkbox.getAttribute('data-id');
                if (id) {
                    selectedIds.add(id);
                }
            });
            refreshSelectionDisplay();
        });
    }

    if (uncheckAllBtn) {
        uncheckAllBtn.addEventListener('click', () => {
            dataTable.querySelectorAll('.itemCheckbox').forEach((checkbox) => {
                const id = checkbox.getAttribute('data-id');
                checkbox.checked = false;
                if (id) {
                    selectedIds.delete(id);
                }
            });
            refreshSelectionDisplay();
        });
    }

    dataTable.addEventListener('click', (event) => {
        if (event.target.closest('input[type="checkbox"]')) {
            return;
        }

        const row = event.target.closest('tr');
        if (row) {
            const checkbox = row.querySelector('.itemCheckbox');
            if (!checkbox) {
                return;
            }
            const checkboxId = checkbox.getAttribute('data-id');
            toggleCheckbox(checkboxId);
        }
    });

    if (openInNewTabBtn) {
        openInNewTabBtn.addEventListener('click', () => {
            const checkedIds = getSelectedIdsSorted();
            if (checkedIds.length > 0) {
                const url = `/marketDetail?ids=${encodeURIComponent(checkedIds.join(','))}`;
                window.open(url, '_blank');
            } else {
                alert('Aucun ID sélectionné.');
            }
        });
    }

    function renderSavedSearch(search) {
        const wrapper = document.createElement('div');
        wrapper.className = 'saved-search-item';
        wrapper.setAttribute('data-search-id', search.id);
        wrapper.setAttribute('data-search-ids', (search.itemIds || []).join(','));
        wrapper.innerHTML = `
        <button type="button" class="open-saved-search-btn btn btn-secondary saved-search-chip"></button>
        <div class="saved-search-actions">
          <button type="button" class="delete-saved-search-btn btn btn-danger saved-search-delete-btn">×</button>
        </div>
      `;
        wrapper.querySelector('.saved-search-chip').textContent = `${search.name} (${(search.itemIds || []).length})`;
        return wrapper;
    }

    if (saveSearchBtn) {
        saveSearchBtn.addEventListener('click', async () => {
            const checkedIds = getSelectedIdsSorted();
            if (checkedIds.length === 0) {
                alert('Sélection vide.');
                return;
            }

            const name = (savedSearchNameInput?.value || '').trim();
            if (!name) {
                alert('Donne un nom à la recherche.');
                return;
            }

            try {
                const response = await fetch('/api/saved-searches', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, itemIds: checkedIds })
                });
                if (!response.ok) {
                    const body = await response.json().catch(() => ({}));
                    throw new Error(body.error || 'Erreur de sauvegarde.');
                }
                const created = await response.json();
                const empty = savedSearchesList.querySelector('.saved-searches-empty');
                if (empty) {
                    empty.remove();
                }
                savedSearchesList.prepend(renderSavedSearch(created));
                if (savedSearchNameInput) {
                    savedSearchNameInput.value = '';
                }
            } catch (error) {
                alert(error.message || 'Impossible de sauvegarder la recherche.');
            }
        });
    }

    if (savedSearchesList) {
        savedSearchesList.addEventListener('click', async (event) => {
            const savedSearchItem = event.target.closest('.saved-search-item');
            if (!savedSearchItem) {
                return;
            }

            if (event.target.classList.contains('open-saved-search-btn')) {
                const ids = savedSearchItem.getAttribute('data-search-ids');
                if (ids) {
                    const url = `/marketDetail?ids=${encodeURIComponent(ids)}`;
                    window.open(url, '_blank');
                }
                return;
            }

            if (event.target.classList.contains('delete-saved-search-btn')) {
                const searchId = savedSearchItem.getAttribute('data-search-id');
                if (!searchId) {
                    return;
                }
                try {
                    const response = await fetch(`/api/saved-searches/${encodeURIComponent(searchId)}`, {
                        method: 'DELETE'
                    });
                    if (!response.ok) {
                        throw new Error('Suppression impossible.');
                    }
                    savedSearchItem.remove();
                    if (!savedSearchesList.querySelector('.saved-search-item')) {
                        const emptyElement = document.createElement('p');
                        emptyElement.className = 'saved-searches-empty';
                        emptyElement.textContent = 'Aucune recherche sauvegardée.';
                        savedSearchesList.appendChild(emptyElement);
                    }
                } catch (error) {
                    alert(error.message || 'Erreur pendant la suppression.');
                }
            }
        });
    }

    function debounce(fn, delay) {
        let timer;
        return function (...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), delay);
        };
    }

    const debouncedReload = debounce(() => {
        loadItems(1).catch((err) => alert(err.message || String(err)));
    }, 450);

    if (filtersForm) {
        filtersForm.addEventListener('submit', (e) => {
            e.preventDefault();
            loadItems(1).catch((err) => alert(err.message || String(err)));
        });
    }

    if (filterInputFr) {
        filterInputFr.addEventListener('input', debouncedReload);
    }
    if (filterInputEn) {
        filterInputEn.addEventListener('input', debouncedReload);
    }
    if (perPageSelect) {
        perPageSelect.addEventListener('change', () => {
            loadItems(1).catch((err) => alert(err.message || String(err)));
        });
    }

    const paginationPanel = document.getElementById('paginationPanel');
    if (paginationPanel) {
        paginationPanel.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-nav-page]');
            if (!btn || btn.classList.contains('disabled')) {
                return;
            }
            const page = Number.parseInt(btn.getAttribute('data-nav-page'), 10);
            if (!Number.isFinite(page) || page < 1) {
                return;
            }
            loadItems(page).catch((err) => alert(err.message || String(err)));
        });
    }

    window.addEventListener('popstate', () => {
        const u = new URL(window.location.href);
        if (filterInputFr) {
            filterInputFr.value = u.searchParams.get('qFr') || '';
        }
        if (filterInputEn) {
            filterInputEn.value = u.searchParams.get('qEn') || '';
        }
        const pp = u.searchParams.get('perPage');
        if (pp && perPageSelect) {
            perPageSelect.value = pp;
        }
        const p = parseInt(u.searchParams.get('page') || '1', 10) || 1;
        loadItems(p, { skipPushState: true }).catch((err) => alert(err.message || String(err)));
    });
});
