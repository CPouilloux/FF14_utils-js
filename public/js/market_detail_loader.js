document.addEventListener('DOMContentLoaded', async () => {
  const idsParam = window.__MARKET_DETAIL_IDS__;
  const loadingPanel = document.getElementById('loadingPanel');
  const loadingText = document.getElementById('loadingText');
  const progressValue = document.getElementById('progressValue');
  const detailContent = document.getElementById('detailContent');

  detailContent.addEventListener('click', (e) => {
    const btn = e.target.closest('.market-detail-remove-item');
    if (!btn) {
      return;
    }
    e.preventDefault();
    const itemId = btn.getAttribute('data-item-id');
    const section = btn.closest('.div-item-tab[data-item-id]');
    if (!section || !itemId) {
      return;
    }
    section.remove();
    const remaining = [...detailContent.querySelectorAll('.div-item-tab[data-item-id]')]
      .map((el) => el.getAttribute('data-item-id'))
      .filter(Boolean);
    if (remaining.length === 0) {
      window.location.href = '/';
      return;
    }
    const csv = remaining.join(',');
    window.__MARKET_DETAIL_IDS__ = csv;
    try {
      history.replaceState(null, '', `/marketDetail?ids=${encodeURIComponent(csv)}`);
    } catch {
      /* ignore */
    }
  });

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  const STALE_SECONDS = 24 * 60 * 60;

  function getFirstListingReviewMeta(listings) {
    if (!listings || listings.length === 0) {
      return { label: '--', isStale: false };
    }
    const first = listings[0];
    const unix = first.lastReviewTimeUnix;
    const label = first.lastReviewTime || '--';
    const isStale = typeof unix === 'number' && (Date.now() / 1000 - unix > STALE_SECONDS);
    return { label, isStale };
  }

  function readObservedPrice(serverId, itemId) {
    try {
      return localStorage.getItem(`ff14_market_observed_${serverId}_${itemId}`) || '';
    } catch {
      return '';
    }
  }

  const MARGIN_MIN_LS = 'ff14_market_margin_min_pct';

  function applyMarginMinMask(root) {
    if (!root) {
      return;
    }
    const marginInput = document.getElementById('marketMarginMinInput');
    const raw = marginInput ? String(marginInput.value || '').trim() : '';
    const minVal = parseFloat(raw.replace(',', '.'));
    const threshold = Number.isFinite(minVal) && minVal > 0 ? minVal : null;

    root.querySelectorAll('.other-server tr[data-estimated-margin-pct]').forEach((row) => {
      const p = row.getAttribute('data-estimated-margin-pct');
      const v = p === '' || p == null ? NaN : parseFloat(String(p));
      if (threshold == null || !Number.isFinite(v)) {
        row.classList.remove('market-margin-below-min');
        return;
      }
      if (v < threshold) {
        row.classList.add('market-margin-below-min');
      } else {
        row.classList.remove('market-margin-below-min');
      }
    });
  }

  const marginInputEl = document.getElementById('marketMarginMinInput');
  if (marginInputEl) {
    try {
      const saved = localStorage.getItem(MARGIN_MIN_LS);
      if (saved != null && saved !== '') {
        marginInputEl.value = saved;
      }
    } catch {
      /* ignore */
    }
    marginInputEl.addEventListener('input', () => {
      try {
        localStorage.setItem(MARGIN_MIN_LS, marginInputEl.value);
      } catch {
        /* ignore */
      }
      applyMarginMinMask(detailContent);
    });
  }

  let progress = 8;
  progressValue.style.width = `${progress}%`;
  const progressInterval = setInterval(() => {
    progress = Math.min(progress + 6, 90);
    progressValue.style.width = `${progress}%`;
  }, 180);

  try {
    const response = await fetch(`/api/market-detail?ids=${encodeURIComponent(idsParam || '')}`);
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || 'Erreur de chargement.');
    }

    loadingText.textContent = 'Finalisation...';
    progressValue.style.width = '100%';
    clearInterval(progressInterval);

    const serverData = payload.server_data;
    const allOtherServers = serverData.all_others_serveur || {};
    const dataById = payload.data || {};
    const itemsMapping = payload.items_mapping || {};
    const requestedOrder = String(idsParam || '')
      .split(',')
      .map((id) => id.trim())
      .filter((id) => /^\d+$/.test(id));
    const itemIds = [];
    const seen = new Set();
    for (const id of requestedOrder) {
      if (seen.has(id)) {
        continue;
      }
      if (
        !Object.prototype.hasOwnProperty.call(dataById, id) &&
        !Object.prototype.hasOwnProperty.call(itemsMapping, id)
      ) {
        continue;
      }
      seen.add(id);
      itemIds.push(id);
    }
    for (const id of Object.keys(dataById)) {
      if (!seen.has(id)) {
        itemIds.push(id);
      }
    }
    let html = '';

    itemIds.forEach(itemId => {
      const itemInfo = payload.items_mapping[itemId] || { name_fr: `Item ${itemId}`, name_en: '' };
      const itemData = payload.data[itemId] || {};
      const mainListings = itemData[serverData.main_serveur_id] || [];
      const cheapestMain = mainListings.length > 0 ? mainListings[0] : null;
      const mainReview = getFirstListingReviewMeta(mainListings);
      const mainTimeClass = mainReview.isStale ? ' review-time--stale' : '';
      const staleTitle = 'Derniere annonce Universalis : plus de 24 h — les donnees peuvent etre perimees.';
      const mainTimeTitle = mainReview.isStale ? ` title="${staleTitle.replace(/"/g, '&quot;')}"` : '';
      const observedStored = readObservedPrice(serverData.main_serveur_id, itemId);

      html += `<section class="div-item-tab item-id-${escapeHtml(itemId)}" data-item-id="${escapeHtml(itemId)}">`;
      html += `<button type="button" class="market-detail-remove-item" data-item-id="${escapeHtml(itemId)}" aria-label="Retirer cet objet de la liste" title="Retirer de la liste">×</button>`;
      html += `<div class="market-detail-heading-row"><button type="button" class="item-favorite-btn" data-item-id="${escapeHtml(itemId)}" aria-label="Ajouter aux favoris" aria-pressed="false">☆</button>`;
      html += `<h2 class="item-title">${escapeHtml(itemInfo.name_fr)} - ${escapeHtml(itemInfo.name_en)}</h2></div>`;
      html += `<div class="servers-grid">`;

      html += `<article class="serveur-values main-server">`;
      html += `<div class="server-name">${escapeHtml(serverData.main_serveur)} — <span class="review-time${mainTimeClass}"${mainTimeTitle}>${escapeHtml(mainReview.label)}</span></div>`;
      html += `<table>`;
      if (mainListings.length === 0) {
        html += `<tr><td colspan="3">Aucune annonce</td></tr>`;
      } else {
        mainListings.slice(0, 10).forEach(listing => {
          const qualityLabel = listing.hq ? 'HQ' : 'NQ';
          const qualityClass = listing.hq ? 'quality-hq' : 'quality-nq';
          html += `<tr>
            <td class="main-price">${escapeHtml(listing.pricePerUnit)}</td>
            <td class="main-quantity"><span class="quality-badge ${qualityClass}">${qualityLabel}</span> * ${escapeHtml(listing.quantity)} =</td>
            <td class="main-total">${escapeHtml(listing.total)}</td>
          </tr>`;
        });
      }
      html += `</table>`;
      html += `<div class="observed-price-panel">`;
      html += `<label class="observed-price-label" for="observed-price-${escapeHtml(itemId)}">Prix vu sur ton serveur</label>`;
      html += `<input type="text" class="observed-price-input" id="observed-price-${escapeHtml(itemId)}" data-item-id="${escapeHtml(itemId)}" data-server-id="${escapeHtml(serverData.main_serveur_id)}" placeholder="ex: 12400" value="${escapeHtml(observedStored)}">`;
      html += `</div></article>`;

      Object.keys(allOtherServers).forEach(serverId => {
        const otherListings = itemData[serverId] || [];
        const otherReview = getFirstListingReviewMeta(otherListings);
        const otherTimeClass = otherReview.isStale ? ' review-time--stale' : '';
        const otherTimeTitle = otherReview.isStale ? ` title="${staleTitle.replace(/"/g, '&quot;')}"` : '';

        html += `<article class="serveur-values other-server">`;
        html += `<div class="server-name">${escapeHtml(allOtherServers[serverId])} — <span class="review-time${otherTimeClass}"${otherTimeTitle}>${escapeHtml(otherReview.label)}</span></div>`;
        html += `<table>`;
        if (otherListings.length === 0) {
          html += `<tr><td colspan="3">Aucune annonce</td></tr>`;
        } else {
          otherListings.slice(0, 10).forEach((listing) => {
            const qualityLabel = listing.hq ? 'HQ' : 'NQ';
            const qualityClass = listing.hq ? 'quality-hq' : 'quality-nq';
            let rowPctAttr = '';
            if (cheapestMain && listing.pricePerUnit > 0) {
              const marginUnit = cheapestMain.pricePerUnit - listing.pricePerUnit;
              const marginPctNum = (marginUnit / listing.pricePerUnit) * 100;
              if (Number.isFinite(marginPctNum)) {
                rowPctAttr = String(marginPctNum);
              }
            }
            html += `<tr data-estimated-margin-pct="${rowPctAttr}">
              <td class="other-price">${escapeHtml(listing.pricePerUnit)}</td>
              <td class="other-quantity"><span class="quality-badge ${qualityClass}">${qualityLabel}</span> * ${escapeHtml(listing.quantity)} =</td>
              <td class="other-total">${escapeHtml(listing.total)}</td>
            </tr>`;
          });
        }
        html += `</table>`;

        let marginText = 'Marge estimée: --';
        if (cheapestMain && otherListings.length > 0) {
          const secPpu = otherListings[0].pricePerUnit;
          if (secPpu > 0) {
            const marginUnit = cheapestMain.pricePerUnit - secPpu;
            const marginPercent = ((marginUnit / secPpu) * 100).toFixed(1);
            marginText = `Marge estimée: <strong>${escapeHtml(marginUnit)}</strong>/u (${escapeHtml(marginPercent)}%)`;
          }
        }
        html += `<div class="estimated-margin">${marginText}</div>`;

        html += `</article>`;
      });

      html += `</div></section>`;
    });

    detailContent.innerHTML = html;
    loadingPanel.style.display = 'none';

    if (window.ItemFavorites && typeof window.ItemFavorites.resync === 'function') {
      window.ItemFavorites.resync();
    }

    applyMarginMinMask(detailContent);

    detailContent.addEventListener('input', (event) => {
      const target = event.target;
      if (!target || !target.classList || !target.classList.contains('observed-price-input')) {
        return;
      }
      const itemKey = target.dataset.itemId;
      const serverKey = target.dataset.serverId;
      if (!itemKey || !serverKey) {
        return;
      }
      try {
        localStorage.setItem(`ff14_market_observed_${serverKey}_${itemKey}`, target.value);
      } catch {
        /* ignore */
      }
    });

    if (typeof window.applyMarketColors === 'function') {
      window.applyMarketColors();
    }
  } catch (error) {
    clearInterval(progressInterval);
    progressValue.style.width = '100%';
    loadingText.textContent = error.message || 'Erreur inattendue.';
    detailContent.innerHTML = '';
  }
});
