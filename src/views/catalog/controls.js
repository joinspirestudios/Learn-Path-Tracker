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
  const hasFilters = !isDiscoveryDefault(state);
  const hasSecondary = state.duration !== 'all' || state.intensity !== 'all' || state.proof !== 'all';
  return '<div class="aurora-discovery-search-header aurora-discovery-toolbar" aria-label="Discover public paths search and filters">'
    + '<div class="aurora-discovery-search-row aurora-discovery-primary-row">'
    + '<label class="aurora-search-control" for="discoveryQuery"><span class="sr-only">Search public paths</span><input type="search" id="discoveryQuery" aria-label="Search public paths" value="' + esc(state.query) + '" placeholder="Search by goal, creator or category"/></label>'
    + '<label class="aurora-category-control"><span>Category</span><select aria-label="Filter by category" data-discovery-field="category">' + optionListHTML(categoryOptions, state.category) + '</select></label>'
    + '<label class="aurora-sort-control"><span>Sort</span><select aria-label="Sort public paths" data-discovery-field="sort">' + optionListHTML(DISCOVERY_SORTS, state.sort) + '</select></label>'
    + '<button class="aurora-button aurora-button-ghost aurora-clear-control aurora-filters-toggle" id="toggleDiscoveryFilters" type="button">Filters</button>'
    + (hasFilters ? '<button class="aurora-button aurora-button-ghost aurora-clear-control" id="clearDiscoveryFilters" type="button">Clear</button>' : '')
    + '</div>'
    + '<div class="aurora-filter-row' + (hasSecondary ? ' is-open' : '') + '" aria-label="Discovery filters" id="discoveryFilterRow">'
    + '<label class="aurora-filter-pill"><span>Duration</span><select aria-label="Filter by duration" data-discovery-field="duration">' + optionListHTML(DISCOVERY_DURATION_BUCKETS, state.duration) + '</select></label>'
    + '<label class="aurora-filter-pill"><span>Intensity</span><select aria-label="Filter by intensity" data-discovery-field="intensity">' + optionListHTML(DISCOVERY_INTENSITIES, state.intensity) + '</select></label>'
    + '<label class="aurora-filter-pill"><span>Proof</span><select aria-label="Filter by proof or activity" data-discovery-field="proof">' + optionListHTML(DISCOVERY_PROOF_FILTERS, state.proof) + '</select></label>'
    + '</div>'
    + '</div>';
}
