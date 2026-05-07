document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('marketServersForm');
    const status = document.getElementById('marketServersStatus');
    const mainLabel = document.getElementById('currentMainLabel');

    if (!form) {
        return;
    }

    /** Clic sur la ligne : bascule uniquement « secondaire » (pas le radio principal). */
    form.addEventListener('click', (e) => {
        if (e.target.closest('.market-dc-actions')) {
            return;
        }
        const row = e.target.closest('.market-world-row');
        if (!row || !form.contains(row)) {
            return;
        }
        if (e.target.closest('input')) {
            return;
        }
        const cb = row.querySelector('.secondary-world-checkbox');
        if (cb) {
            cb.checked = !cb.checked;
        }
    });

    /** Par centre de données : tout cocher / tout décocher les cases secondaires. */
    form.addEventListener('click', (e) => {
        const allBtn = e.target.closest('.btn-dc-secondary-all');
        const noneBtn = e.target.closest('.btn-dc-secondary-none');
        if (!allBtn && !noneBtn) {
            return;
        }
        const fieldset = e.target.closest('.market-dc-group');
        if (!fieldset || !form.contains(fieldset)) {
            return;
        }
        const checkboxes = fieldset.querySelectorAll('.secondary-world-checkbox');
        const v = Boolean(allBtn);
        checkboxes.forEach((cb) => {
            cb.checked = v;
        });
    });

    function setStatus(text, isError) {
        if (!status) {
            return;
        }
        status.textContent = text || '';
        status.classList.toggle('is-error', Boolean(isError));
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const checkedMain = form.querySelector('input[name="mainWorldId"]:checked');
        if (!checkedMain) {
            setStatus('Choisis un serveur principal.', true);
            return;
        }
        const secondaryWorldIds = Array.from(form.querySelectorAll('.secondary-world-checkbox:checked')).map((cb) =>
            cb.value
        );
        setStatus('Enregistrement…', false);
        try {
            const response = await fetch('/api/market-servers-settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mainWorldId: checkedMain.value,
                    secondaryWorldIds
                })
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(payload.error || 'Sauvegarde impossible.');
            }
            const config = payload.config || {};
            const nextMain = String(config.mainWorldId || '');
            form.querySelectorAll('input[name="mainWorldId"]').forEach((radio) => {
                radio.checked = radio.value === nextMain;
            });
            const secondaries = new Set((config.secondaryWorldIds || []).map((id) => String(id)));
            form.querySelectorAll('.secondary-world-checkbox').forEach((cb) => {
                cb.checked = secondaries.has(cb.value);
            });
            const row = checkedMain.closest('.market-world-row');
            const nameEl = row ? row.querySelector('.world-name') : null;
            if (mainLabel && nameEl) {
                mainLabel.textContent = nameEl.textContent || nextMain;
            }
            setStatus('Configuration enregistrée.', false);
        } catch (error) {
            setStatus(error.message || 'Erreur réseau.', true);
        }
    });
});
