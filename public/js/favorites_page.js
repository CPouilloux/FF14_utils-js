document.addEventListener('DOMContentLoaded', () => {
    const tbody = document.getElementById('favoritesTableBody');
    const checkedIdsDiv = document.getElementById('favoritesCheckedIds');
    const checkAllBtn = document.getElementById('favoritesCheckAllBtn');
    const uncheckAllBtn = document.getElementById('favoritesUncheckAllBtn');
    const openMarketBtn = document.getElementById('favoritesOpenMarketBtn');
    const dataTable = document.getElementById('dataTable');

    const selectedIds = new Set();

    function dataRowCount() {
        return tbody ? tbody.querySelectorAll('tr[data-favorite-row]').length : 0;
    }

    function getSelectedIdsSorted() {
        return Array.from(selectedIds).sort((a, b) => Number(a) - Number(b));
    }

    function refreshSelectionDisplay() {
        if (!checkedIdsDiv) {
            return;
        }
        const ids = getSelectedIdsSorted();
        checkedIdsDiv.textContent = ids.length > 0 ? ids.join(', ') : 'Aucun item sélectionné.';
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
        if (!tbody) {
            return;
        }
        tbody.querySelectorAll('.itemCheckbox').forEach((cb) => {
            const id = cb.getAttribute('data-id');
            cb.checked = id ? selectedIds.has(id) : false;
        });
    }

    function refreshCheckAllState() {
        const n = dataRowCount();
        if (checkAllBtn) {
            const can = n > 0 && n <= 20;
            checkAllBtn.disabled = !can;
            checkAllBtn.title = n > 20 ? 'Disponible uniquement quand la liste comporte au plus 20 favoris.' : '';
        }
    }

    window.__favoritesAfterDomChange = function (removedItemId) {
        selectedIds.delete(String(removedItemId));
        if (dataRowCount() === 0) {
            selectedIds.clear();
        }
        syncCheckboxesFromSet();
        refreshSelectionDisplay();
        refreshCheckAllState();
    };

    if (dataTable) {
        dataTable.addEventListener('change', (e) => {
            if (!e.target.classList.contains('itemCheckbox')) {
                return;
            }
            syncCheckboxIntoSet(e.target);
        });

        dataTable.addEventListener('click', (e) => {
            if (e.target.closest('input[type="checkbox"]')) {
                return;
            }
            if (e.target.closest('.item-favorite-btn')) {
                return;
            }
            const row = e.target.closest('tr[data-favorite-row]');
            if (!row) {
                return;
            }
            const checkbox = row.querySelector('.itemCheckbox');
            if (!checkbox) {
                return;
            }
            checkbox.checked = !checkbox.checked;
            syncCheckboxIntoSet(checkbox);
        });
    }

    if (checkAllBtn) {
        checkAllBtn.addEventListener('click', () => {
            if (checkAllBtn.disabled || !tbody) {
                return;
            }
            tbody.querySelectorAll('.itemCheckbox').forEach((checkbox) => {
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
            selectedIds.clear();
            if (tbody) {
                tbody.querySelectorAll('.itemCheckbox').forEach((checkbox) => {
                    checkbox.checked = false;
                });
            }
            refreshSelectionDisplay();
        });
    }

    if (openMarketBtn) {
        openMarketBtn.addEventListener('click', () => {
            const ids = getSelectedIdsSorted();
            if (ids.length === 0) {
                window.alert('Coche au moins un favori.');
                return;
            }
            const url = `/marketDetail?ids=${encodeURIComponent(ids.join(','))}`;
            window.open(url, '_blank');
        });
    }

    refreshCheckAllState();
});
