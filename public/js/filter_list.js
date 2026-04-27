document.addEventListener('DOMContentLoaded', () => {
    const filtersForm = document.getElementById('filtersForm');
    const filterInputFr = document.getElementById('filterInputFr');
    const filterInputEn = document.getElementById('filterInputEn');
    const perPageSelect = document.getElementById('perPageSelect');
    const dataTable = document.getElementById('dataTable');
    const itemCheckboxes = document.querySelectorAll('.itemCheckbox');
    const checkedIdsDiv = document.getElementById('checkedIds');
    const checkAllBtn = document.getElementById('checkAllBtn');
    const uncheckAllBtn = document.getElementById('uncheckAllBtn');
    const openInNewTabBtn = document.getElementById('openInNewTabBtn');
    const saveSearchBtn = document.getElementById('saveSearchBtn');
    const savedSearchNameInput = document.getElementById('savedSearchNameInput');
    const savedSearchesList = document.getElementById('savedSearchesList');
    const canSelectAll = itemCheckboxes.length <= 20;
  
    // Mettre à jour la liste des IDs cochés
    function updateCheckedIds() {
      const checkedIds = Array.from(itemCheckboxes)
        .filter(checkbox => checkbox.checked)
        .map(checkbox => checkbox.getAttribute('data-id'));
      checkedIdsDiv.textContent = checkedIds.length > 0 ? checkedIds.join(', ') : 'Aucun item sélectionné.';
      return checkedIds;
    }
  
    // Écouter les changements d'état des cases à cocher
    itemCheckboxes.forEach(checkbox => {
      checkbox.addEventListener('change', updateCheckedIds);
    });

    if (checkAllBtn) {
      if (!canSelectAll) {
        checkAllBtn.disabled = true;
        checkAllBtn.title = 'Disponible uniquement quand 20 lignes max sont affichées.';
      }

      checkAllBtn.addEventListener('click', () => {
        if (!canSelectAll) {
          return;
        }
        itemCheckboxes.forEach(checkbox => {
          checkbox.checked = true;
        });
        updateCheckedIds();
      });
    }
  
    // Décocher toutes les cases à cocher
    uncheckAllBtn.addEventListener('click', () => {
      itemCheckboxes.forEach(checkbox => {
        checkbox.checked = false;
      });
      updateCheckedIds(); // Met à jour la liste après avoir décoché toutes les cases
    });
  
    // Ajouter des événements de clic sur les textes pour cocher/décocher les cases
    function toggleCheckbox(checkboxId) {
      const checkbox = document.querySelector(`.itemCheckbox[data-id="${checkboxId}"]`);
      if (checkbox) {
        checkbox.checked = !checkbox.checked;
        updateCheckedIds(); // Met à jour la liste des IDs cochés
      }
    }
  
    // Clic sur une ligne pour sélectionner/désélectionner l'item.
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
  
    // Ouvrir un nouvel onglet avec les IDs cochés
    openInNewTabBtn.addEventListener('click', () => {
      const checkedIds = updateCheckedIds();
      if (checkedIds.length > 0) {
        const url = `/marketDetail?ids=${encodeURIComponent(checkedIds.join(','))}`;
        window.open(url, '_blank');
      } else {
        alert('Aucun ID sélectionné.');
      }
    });

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
        const checkedIds = updateCheckedIds();
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

    // Recherche auto après une courte pause de frappe.
    const submitFiltersDebounced = debounce(() => {
      if (filtersForm) {
        filtersForm.submit();
      }
    }, 450);

    if (filterInputFr) {
      filterInputFr.addEventListener('input', submitFiltersDebounced);
    }
    if (filterInputEn) {
      filterInputEn.addEventListener('input', submitFiltersDebounced);
    }
    if (perPageSelect) {
      perPageSelect.addEventListener('change', () => {
        if (filtersForm) {
          filtersForm.submit();
        }
      });
    }
  });
  