document.addEventListener('DOMContentLoaded', () => {
    const filterInputFr = document.getElementById('filterInputFr');
    const filterInputEn = document.getElementById('filterInputEn');
    const dataTable = document.getElementById('dataTable');
    const itemCheckboxes = document.querySelectorAll('.itemCheckbox');
    const checkedIdsDiv = document.getElementById('checkedIds');
    const uncheckAllBtn = document.getElementById('uncheckAllBtn');
    const openInNewTabBtn = document.getElementById('openInNewTabBtn');
  
    // Fonction pour filtrer les lignes de la table en fonction des champs de texte
    function filterTable() {
      const filterValueFr = filterInputFr.value.toLowerCase();
      const filterValueEn = filterInputEn.value.toLowerCase();
      const rows = dataTable.getElementsByTagName('tr');
  
      for (let i = 0; i < rows.length; i++) {
        const nameFrDiv = rows[i].querySelector('.name_fr');
        const nameEnDiv = rows[i].querySelector('.name_en');
        if (nameFrDiv && nameEnDiv) {
          const textValueFr = nameFrDiv.textContent || nameFrDiv.innerText;
          const textValueEn = nameEnDiv.textContent || nameEnDiv.innerText;
          const showRow = textValueFr.toLowerCase().includes(filterValueFr) &&
                          textValueEn.toLowerCase().includes(filterValueEn);
          rows[i].style.display = showRow ? '' : 'none';
        }
      }
    }
  
    // Filtrer les éléments de la table en fonction des champs de texte
    filterInputFr.addEventListener('input', filterTable);
    filterInputEn.addEventListener('input', filterTable);
  
    // Mettre à jour la liste des IDs cochés
    function updateCheckedIds() {
      const checkedIds = Array.from(itemCheckboxes)
        .filter(checkbox => checkbox.checked)
        .map(checkbox => checkbox.getAttribute('data-id'));
      checkedIdsDiv.textContent = checkedIds.join(', ');
      return checkedIds;
    }
  
    // Écouter les changements d'état des cases à cocher
    itemCheckboxes.forEach(checkbox => {
      checkbox.addEventListener('change', updateCheckedIds);
    });
  
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
  
    // Ajouter des événements de clic sur les éléments de texte
    dataTable.addEventListener('click', (event) => {
      if (event.target.classList.contains('name_fr') || event.target.classList.contains('name_en')) {
        const checkboxId = event.target.getAttribute('data-checkbox-id');
        toggleCheckbox(checkboxId);
      }
    });
  
    // Ouvrir un nouvel onglet avec les IDs cochés
    openInNewTabBtn.addEventListener('click', () => {
      const checkedIds = updateCheckedIds();
      if (checkedIds.length > 0) {
        const url = `/someEndpoint?ids=${encodeURIComponent(checkedIds.join(','))}`;
        window.open(url, '_blank');
      } else {
        alert('Aucun ID sélectionné.');
      }
    });
  });
  