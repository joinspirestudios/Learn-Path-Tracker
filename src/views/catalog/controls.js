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
  const activeBits = [];
  if(state.query) activeBits.push('search "' + state.query + '"');
  if(state.category !== 'all') activeBits.push('category');
  if(state.duration !== 'all') activeBits.push('duration');
  if(state.intensity !== 'all') activeBits.push('intensity');
  if(state.proof !== 'all') activeBits.push('proof/activity');
  if(state.sort !== 'recommended') activeBits.push('custom sort');
  const activeText = activeBits.length ? 'Active filters: ' + activeBits.join(', ') : 'No filters applied';
  return '<div class="discovery-controls discovery-toolbar lpt-discovery-toolbar" aria-label="Discover public paths search and filters">'
    + '<div class="discovery-mainline">'
    + '<div class="discovery-search-shell lpt-search-primary"><label class="sr-only" for="discoveryQuery">Search public paths</label><input type="search" id="discoveryQuery" aria-label="Search public paths" value="' + esc(state.query) + '" placeholder="Search by goal, creator or category"/><button class="btn subtle discovery-clear-action" id="clearDiscoverySearch" type="button" ' + (state.query ? '' : 'disabled') + '>Clear</button></div>'
    + '<label class="discovery-sort-control"><span>Sort</span><select aria-label="Sort public paths" data-discovery-field="sort">' + optionListHTML(DISCOVERY_SORTS, state.sort) + '</select></label>'
    + '<button class="btn subtle discovery-clear-action" id="clearDiscoveryFilters" type="button" ' + (isDiscoveryDefault(state) ? 'disabled' : '') + '>Clear filters</button>'
    + '</div>'
    + '<div class="discovery-filter-chips" aria-label="Discovery filters">'
    + '<label class="discovery-filter-chip"><span>Category</span><select aria-label="Filter by category" data-discovery-field="category">' + optionListHTML(categoryOptions, state.category) + '</select></label>'
    + '<label class="discovery-filter-chip"><span>Duration</span><select aria-label="Filter by duration" data-discovery-field="duration">' + optionListHTML(DISCOVERY_DURATION_BUCKETS, state.duration) + '</select></label>'
    + '<label class="discovery-filter-chip"><span>Intensity</span><select aria-label="Filter by intensity" data-discovery-field="intensity">' + optionListHTML(DISCOVERY_INTENSITIES, state.intensity) + '</select></label>'
    + '<label class="discovery-filter-chip"><span>Proof</span><select aria-label="Filter by proof or activity" data-discovery-field="proof">' + optionListHTML(DISCOVERY_PROOF_FILTERS, state.proof) + '</select></label>'
    + '</div>'
    + '<p class="discovery-active-summary" aria-live="polite">' + esc(activeText) + '</p>'
    + '</div>';
}
