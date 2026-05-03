document.addEventListener('DOMContentLoaded', async () => {
  const idsParam = window.__MARKET_DETAIL_IDS__;
  const loadingPanel = document.getElementById('loadingPanel');
  const loadingText = document.getElementById('loadingText');
  const progressValue = document.getElementById('progressValue');
  const detailContent = document.getElementById('detailContent');

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
      const bestMainListing = mainListings.length > 0 ? mainListings[0] : null;
      const mainReview = getFirstListingReviewMeta(mainListings);
      const mainTimeClass = mainReview.isStale ? ' review-time--stale' : '';
      const staleTitle = 'Derniere annonce Universalis : plus de 24 h — les donnees peuvent etre perimees.';
      const mainTimeTitle = mainReview.isStale ? ` title="${staleTitle.replace(/"/g, '&quot;')}"` : '';
      const observedStored = readObservedPrice(serverData.main_serveur_id, itemId);

      html += `<section class="div-item-tab item-id-${escapeHtml(itemId)}">`;
      html += `<h2 class="item-title">${escapeHtml(itemInfo.name_fr)} - ${escapeHtml(itemInfo.name_en)}</h2>`;
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
        let marginText = 'Marge estimée: --';
        if (bestMainListing && otherListings.length > 0) {
          const marginUnit = bestMainListing.pricePerUnit - otherListings[0].pricePerUnit;
          const marginPercent = ((marginUnit / otherListings[0].pricePerUnit) * 100).toFixed(1);
          marginText = `Marge estimée: <strong>${escapeHtml(marginUnit)}</strong>/u (${escapeHtml(marginPercent)}%)`;
        }

        html += `<article class="serveur-values other-server">`;
        html += `<div class="server-name">${escapeHtml(allOtherServers[serverId])} — <span class="review-time${otherTimeClass}"${otherTimeTitle}>${escapeHtml(otherReview.label)}</span></div>`;
        html += `<table>`;
        if (otherListings.length === 0) {
          html += `<tr><td colspan="3">Aucune annonce</td></tr>`;
        } else {
          otherListings.slice(0, 10).forEach(listing => {
            const qualityLabel = listing.hq ? 'HQ' : 'NQ';
            const qualityClass = listing.hq ? 'quality-hq' : 'quality-nq';
            html += `<tr>
              <td class="other-price">${escapeHtml(listing.pricePerUnit)}</td>
              <td class="other-quantity"><span class="quality-badge ${qualityClass}">${qualityLabel}</span> * ${escapeHtml(listing.quantity)} =</td>
              <td class="other-total">${escapeHtml(listing.total)}</td>
            </tr>`;
          });
        }
        html += `</table>`;
        html += `<div class="estimated-margin">${marginText}</div>`;
        html += `</article>`;
      });

      html += `</div></section>`;
    });

    detailContent.innerHTML = html;
    loadingPanel.style.display = 'none';

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
