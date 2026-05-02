document.addEventListener('DOMContentLoaded', () => {
    const gate = document.getElementById('macroGate');
    const workspace = document.getElementById('macroWorkspace');
    const gateMessage = document.getElementById('macroGateMessage');
    const gateError = document.getElementById('macroGateError');
    const input = document.getElementById('macroInput');
    const output = document.getElementById('macroOutput');
    const btn = document.getElementById('translateBtn');
    const clearBtn = document.getElementById('clearMacroBtn');
    const copyBtn = document.getElementById('copyMacroResultBtn');
    const message = document.getElementById('macroMessage');
    const dictStatus = document.getElementById('dictStatus');

    const initialState = window.__MACRO_DICT_STATE__ || { phase: 'idle', ready: false, error: null };

    function setGateVisible(visible) {
        if (!gate || !workspace) {
            return;
        }
        if (visible) {
            gate.classList.remove('hidden');
            workspace.classList.add('hidden');
        } else {
            gate.classList.add('hidden');
            workspace.classList.remove('hidden');
        }
    }

    function renderGateFromStatus(data) {
        if (!gateMessage) {
            return;
        }
        const phase = data.phase || 'idle';
        if (phase === 'error') {
            gateMessage.textContent = 'Impossible de charger le dictionnaire des sorts.';
            if (gateError) {
                gateError.textContent = data.error || 'Erreur inconnue.';
                gateError.classList.remove('hidden');
            }
            return;
        }
        if (gateError) {
            gateError.textContent = '';
            gateError.classList.add('hidden');
        }
        if (phase === 'loading') {
            gateMessage.textContent = 'Chargement des noms de sorts en cours (cache local ou XIVAPI). Cela peut prendre plusieurs minutes si le cache est absent ou incomplet. Cette page se debloquera automatiquement une fois le chargement termine.';
            return;
        }
        gateMessage.textContent = 'Initialisation du serveur : le dictionnaire va etre charge en arriere-plan. Patiente quelques secondes…';
    }

    function updateDictStatusLine(data) {
        if (!dictStatus) {
            return;
        }
        if (data.ready) {
            dictStatus.textContent = `Dictionnaire pret (${data.entryCount || 0} noms anglais indexes).`;
        } else {
            dictStatus.textContent = '';
        }
    }

    function applyReadyUi(data) {
        setGateVisible(false);
        updateDictStatusLine(data);
        if (input) {
            input.disabled = false;
        }
        if (output) {
            output.disabled = false;
        }
        if (btn) {
            btn.disabled = false;
        }
        if (clearBtn) {
            clearBtn.disabled = false;
        }
        if (copyBtn) {
            copyBtn.disabled = false;
        }
    }

    function applyBlockedUi(data) {
        setGateVisible(true);
        renderGateFromStatus(data);
        if (input) {
            input.disabled = true;
        }
        if (output) {
            output.disabled = true;
        }
        if (btn) {
            btn.disabled = true;
        }
        if (clearBtn) {
            clearBtn.disabled = true;
        }
        if (copyBtn) {
            copyBtn.disabled = true;
        }
    }

    async function fetchStatus() {
        const res = await fetch('/api/macro-translate-status');
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }
        return res.json();
    }

    if (initialState.ready) {
        applyReadyUi(initialState);
    } else {
        applyBlockedUi(initialState);
        if (initialState.phase !== 'error') {
            const pollMs = 2000;
            const timer = setInterval(async () => {
                try {
                    const data = await fetchStatus();
                    window.__MACRO_DICT_STATE__ = data;
                    if (data.ready) {
                        clearInterval(timer);
                        applyReadyUi(data);
                    } else if (data.phase === 'error') {
                        clearInterval(timer);
                        applyBlockedUi(data);
                    } else {
                        renderGateFromStatus(data);
                    }
                } catch {
                    /* on garde le message courant */
                }
            }, pollMs);
        }
    }

    if (!input || !output || !btn) {
        return;
    }

    btn.addEventListener('click', async () => {
        try {
            const st = await fetchStatus();
            if (!st.ready) {
                if (message) {
                    message.textContent = 'Le dictionnaire nest pas encore pret.';
                }
                return;
            }
        } catch {
            if (message) {
                message.textContent = 'Impossible de verifier le statut du serveur.';
            }
            return;
        }

        btn.disabled = true;
        if (message) {
            message.textContent = 'Traduction en cours…';
        }
        try {
            const res = await fetch('/api/macro-translate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: input.value })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data.error || `Erreur HTTP ${res.status}`);
            }
            output.value = data.translated ?? '';
            if (message) {
                message.textContent = data.entryCount
                    ? `OK — ${data.entryCount} entrees dans le dictionnaire.`
                    : 'OK.';
            }
            updateDictStatusLine(data);
        } catch (err) {
            if (message) {
                message.textContent = err.message || 'Erreur inconnue.';
            }
        } finally {
            btn.disabled = false;
        }
    });

    async function copyTextToClipboard(text) {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            return;
        }
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        if (!ok) {
            throw new Error('execCommand copy a echoue');
        }
    }

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            input.value = '';
            output.value = '';
            if (message) {
                message.textContent = 'Contenu efface.';
            }
        });
    }

    if (copyBtn) {
        copyBtn.addEventListener('click', async () => {
            const text = output.value;
            if (!text.trim()) {
                if (message) {
                    message.textContent = 'Rien a copier.';
                }
                return;
            }
            try {
                await copyTextToClipboard(text);
                if (message) {
                    message.textContent = 'Copie dans le presse-papiers.';
                }
            } catch {
                if (message) {
                    message.textContent = 'Copie impossible (permissions ou navigateur).';
                }
            }
        });
    }
});
