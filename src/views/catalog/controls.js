import { esc } from '../../helpers.js';
import {
  DISCOVERY_DURATION_BUCKETS, DISCOVERY_INTENSITIES, DISCOVERY_PROOF_FILTERS, DISCOVERY_SORTS,
  discoveryCategoryOptions, isDiscoveryDefault,
} from '../../discovery.js';

export function optionListHTML(options, selected){
  return options.map(option => '<option value="' + esc(option.id) + '" ' + (option.id === selected ? 'selected' : '') + '>' + esc(option.label) + '</option>').join('');
}

export function discoveryControlsHTML(paths, state){
  const categoryOptions = [{ id:'all', label:'All categories' }, ...discoveryCategoryOptions(paths)];
  return '<div class="discovery-controls panel card">'
    + '<div class="discovery-search field"><label for="discoveryQuery">Search public paths</label><div class="discovery-search-row"><input type="search" id="discoveryQuery" value="' + esc(state.query) + '" placeholder="Search paths by goal, topic, creator or category"/><button class="btn" id="clearDiscoverySearch" type="button" ' + (state.query ? '' : 'disabled') + '>Clear</button></div></div>'
    + '<div class="discovery-filter-row">'
    + '<label>Category<select data-discovery-field="category">' + optionListHTML(categoryOptions, state.category) + '</select></label>'
    + '<label>Duration<select data-discovery-field="duration">' + optionListHTML(DISCOVERY_DURATION_BUCKETS, state.duration) + '</select></label>'
    + '<label>Intensity<select data-discovery-field="intensity">' + optionListHTML(DISCOVERY_INTENSITIES, state.intensity) + '</select></label>'
    + '<label>Proof/activity<select data-discovery-field="proof">' + optionListHTML(DISCOVERY_PROOF_FILTERS, state.proof) + '</select></label>'
    + '<label>Sort<select data-discovery-field="sort">' + optionListHTML(DISCOVERY_SORTS, state.sort) + '</select></label>'
    + '</div><div class="discovery-actions"><button class="btn" id="clearDiscoveryFilters" type="button" ' + (isDiscoveryDefault(state) ? 'disabled' : '') + '>Clear filters</button></div>'
    + '</div>';
}
