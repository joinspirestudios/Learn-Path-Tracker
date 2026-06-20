import { clearDiscoveryState } from '../../discovery.js';

let discoverySearchTimer = null;

export async function openCatalogPath(id, { store, canOpenFullPath, openPathRoute, openSkill } = {}){
  const def = store.state.userPaths?.[id];
  if(def?.platform && !canOpenFullPath(id, def)){
    await openPathRoute(id, true, {}, { source:'catalog' });
    return;
  }
  await openSkill(id);
}

export function bindCatalogEvents(context = {}){
  const {
    $, store, renderCatalog, openPathRoute, openSkill, canOpenFullPath,
    getOpeningPathId, setOpeningPathId, importLocalPath, createPath,
    openAIPathBuilder, openAuthModal, loadMorePublicPaths,
  } = context;
  const content = $('content');
  const dq = $('discoveryQuery');
  if(dq) dq.oninput = e => {
    store.discovery.query = e.target.value;
    const cursor = e.target.selectionStart || store.discovery.query.length;
    clearTimeout(discoverySearchTimer);
    discoverySearchTimer = setTimeout(() => {
      renderCatalog();
      const next = $('discoveryQuery');
      if(next){
        next.focus();
        try{ next.setSelectionRange(cursor, cursor); }catch(error){}
      }
    }, 160);
  };
  const clearSearch = $('clearDiscoverySearch');
  if(clearSearch) clearSearch.onclick = () => {
    store.discovery.query = '';
    renderCatalog();
  };
  content.querySelectorAll('[data-discovery-field]').forEach(select => {
    select.onchange = e => {
      store.discovery[e.target.dataset.discoveryField] = e.target.value;
      renderCatalog();
    };
  });
  const clearFilters = $('clearDiscoveryFilters');
  if(clearFilters) clearFilters.onclick = () => {
    store.discovery = clearDiscoveryState();
    renderCatalog();
  };
  const loadMore = $('loadMorePublicPaths');
  if(loadMore && typeof loadMorePublicPaths === 'function'){
    loadMore.onclick = async () => {
      loadMore.disabled = true;
      loadMore.textContent = 'Loading more paths...';
      await loadMorePublicPaths();
    };
  }
  content.querySelectorAll('.skill-card[data-id]').forEach(card => {
    card.onclick = () => {
      const id = card.dataset.id;
      if(getOpeningPathId() === id) return;
      setOpeningPathId(id);
      card.disabled = true;
      card.classList.add('is-opening');
      const cta = card.querySelector('.sc-cta');
      if(cta) cta.textContent = 'Opening...';
      openCatalogPath(id, { store, canOpenFullPath, openPathRoute, openSkill });
    };
  });
  content.querySelectorAll('[data-import]').forEach(button => {
    button.onclick = e => {
      e.stopPropagation();
      importLocalPath(button.dataset.import);
    };
  });
  const createCard = $('createCard');
  if(createCard) createCard.onclick = createPath;
  const aiCard = $('aiCreateCard');
  if(aiCard) aiCard.onclick = openAIPathBuilder;
  const signinCard = $('signinCard');
  if(signinCard) signinCard.onclick = () => openAuthModal('signup');
}
