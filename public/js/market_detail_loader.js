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
    const itemIds = Object.keys(payload.data || {});
    let html = '';

    itemIds.forEach(itemId => {
      const itemInfo = payload.items_mapping[itemId] || { name_fr: `Item ${itemId}`, name_en: '' };
      const itemData = payload.data[itemId] || {};
      const mainListings = itemData[serverData.main_serveur_id] || [];
      const bestMainListing = mainListings.length > 0 ? mainListings[0] : null;
      const mainHour = mainListings.length > 0 ? mainListings[0].lastReviewTime : '--:--';

      html += `<section class="div-item-tab item-id-${escapeHtml(itemId)}">`;
      html += `<h2 class="item-title">${escapeHtml(itemInfo.name_fr)} - ${escapeHtml(itemInfo.name_en)}</h2>`;
      html += `<div class="servers-grid">`;

      html += `<article class="serveur-values main-server">`;
      html += `<div class="server-name">${escapeHtml(serverData.main_serveur)} - ${escapeHtml(mainHour)}</div>`;
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
      html += `</table></article>`;

      Object.keys(allOtherServers).forEach(serverId => {
        const otherListings = itemData[serverId] || [];
        const hour = otherListings.length > 0 ? otherListings[0].lastReviewTime : '--:--';
        let marginText = 'Marge estimée: --';
        if (bestMainListing && otherListings.length > 0) {
          const marginUnit = bestMainListing.pricePerUnit - otherListings[0].pricePerUnit;
          const marginPercent = ((marginUnit / otherListings[0].pricePerUnit) * 100).toFixed(1);
          marginText = `Marge estimée: <strong>${escapeHtml(marginUnit)}</strong>/u (${escapeHtml(marginPercent)}%)`;
        }

        html += `<article class="serveur-values other-server">`;
        html += `<div class="server-name">${escapeHtml(allOtherServers[serverId])} - ${escapeHtml(hour)}</div>`;
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
