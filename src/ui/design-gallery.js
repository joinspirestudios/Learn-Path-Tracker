import {
  renderButton, renderCompletionResultPanel, renderDailyScoreCard, renderDailyTaskCard,
  renderEmptyState, renderMetricPill, renderProgressMeter, renderProofActionRow,
  renderProofFirstProgressCard, renderProofMetricCard, renderProofStudioTodayHero,
  renderProofUploadCard, renderRoadmapNode, renderToastBanner, renderConsistencyCard,
} from './core-components.js';
import { renderAppShell, renderCoreColumn, renderSessionHeader } from './core-layout.js';
import { auroraRoadmapDayItemHTML } from '../views/roadmap-render.js';

export function renderDesignSystemGallery(){
  const examples = [
    '<section><h2>Aurora Buttons</h2><p class="lpt-gallery-note">Component example. Static mock values only.</p><div class="lpt-gallery-row">'
      + renderButton({ label:'Rest primary', variant:'primary' })
      + renderButton({ label:'Hover state example', variant:'secondary' })
      + renderButton({ label:'Active state example', variant:'ghost' })
      + renderButton({ label:'Focus state example', variant:'secondary' })
      + renderButton({ label:'Destructive', variant:'destructive' })
      + renderButton({ label:'Loading', variant:'primary', loading:true })
      + renderButton({ label:'Disabled', variant:'secondary', disabled:true })
      + '</div></section>',
    '<section><h2>ProgressMeter</h2>' + renderProgressMeter({ value:68, label:'Gallery progress' }) + '</section>',
    '<section><h2>DailyScoreCard</h2>' + renderDailyScoreCard({ score:68, tier:'passed', copy:'Documented work is moving.' }) + '</section>',
    '<section><h2>DailyTaskCard</h2>' + renderDailyTaskCard({ title:'Read and capture notes', description:'One focused task at a time.', needsEvidence:true, evidenceCount:0 }) + '</section>',
    '<section><h2>ProofUploadCard</h2>' + renderProofUploadCard({ state:'success', title:'Proof saved', body:'The task can now count.' }) + renderProofUploadCard({ state:'error', title:'Proof error', error:'Upload failed.' }) + '</section>',
    '<section><h2>CompletionResultPanel</h2>' + renderCompletionResultPanel({ score:92, tier:'strong', taskSummary:'4 of 5 tasks complete', proofSummary:'2 proof items saved', publishEligible:true }) + '</section>',
    '<section><h2>MetricPills</h2><div class="lpt-gallery-row">' + renderMetricPill({ label:'day streak', value:'7' }) + renderMetricPill({ label:'proof', value:'3' }) + '</div></section>',
    '<section><h2>EmptyState</h2>' + renderEmptyState({ title:'No active path', body:'Create or join a path to start today.', action:renderButton({ label:'Browse Discover', variant:'primary' }) }) + '</section>',
    '<section><h2>ToastBanner</h2>' + renderToastBanner({ message:'Proof saved', variant:'success' }) + '</section>',
    '<section><h2>Proof Studio Today hero</h2><p class="lpt-gallery-note">Component example. Static mock values only.</p>'
      + renderProofStudioTodayHero({
        pathTitle:'Component example path',
        dayContext:'Day 12 - Jun 21',
        title:'Build the daily proof note',
        tasks:["Review yesterday's lesson", 'Record one proof note', 'Save the reflection'],
        proofSummary:'1 task asks for proof before it can count.',
        ctaLabel:'Continue day',
      }) + '</section>',
    '<section><h2>Aurora path card</h2><p class="lpt-gallery-note">Component example. Static mock values only.</p>'
      + '<button class="skill-card aurora-path-card" type="button">'
      + '<div class="aurora-path-card-meta"><span class="aurora-path-card-creator">By Component author</span><span class="aurora-path-card-status">Public preview</span></div>'
      + '<h3 class="aurora-path-card-title">A long public path title that wraps without colliding with creator or tags</h3>'
      + '<p class="aurora-path-card-subtitle">Creative practice</p>'
      + '<p class="aurora-path-card-description">Proof-first cards stack metadata, title, description, tags, metrics and action regions so nothing floats over anything else.</p>'
      + '<div class="aurora-path-card-tags"><span>Proof-backed</span><span>Component example</span></div>'
      + '<div class="aurora-path-card-metrics"><span>3 joined</span><span>2 proof submitted</span></div>'
      + '<div class="aurora-path-card-action">View &rarr;</div></button></section>',
    '<section><h2>Compact discovery toolbar</h2><p class="lpt-gallery-note">Component example. Static mock values only.</p>'
      + '<div class="aurora-discovery-toolbar" aria-label="Discover public paths search and filters"><div class="aurora-discovery-primary-row"><label class="aurora-search-control"><span class="sr-only">Search public paths</span><input id="galleryDiscoveryQuery" type="search" aria-label="Search public paths" placeholder="Search by goal, creator or category"/></label><label class="aurora-sort-control"><span>Sort</span><select><option>Recommended</option></select></label><button class="aurora-button" type="button">Clear</button><button class="aurora-button" type="button">Reset filters</button></div><div class="aurora-filter-row"><label class="aurora-filter-pill"><span>Category</span><select><option>All</option></select></label><label class="aurora-filter-pill"><span>Duration</span><select><option>Any</option></select></label><label class="aurora-filter-pill"><span>Intensity</span><select><option>Any</option></select></label><label class="aurora-filter-pill"><span>Proof</span><select><option>All</option></select></label></div><p class="aurora-filter-summary">Component example. No filters applied.</p></div></section>',
    '<section><h2>Aurora tier chips</h2><p class="lpt-gallery-note">Component example. Static mock values only.</p><div class="lpt-gallery-row"><span class="lpt-result-tier lpt-completion-passed">Passed</span><span class="lpt-result-tier lpt-completion-strong">Strong</span><span class="lpt-result-tier lpt-completion-perfect">Perfect</span></div></section>',
    '<section><h2>Aurora proof journey</h2><p class="lpt-gallery-note">Component example. Static mock values only.</p><section class="aurora-roadmap-panel"><header class="aurora-roadmap-header"><div><span class="aurora-section-kicker">Your path</span><h3>Proof journey</h3></div><div class="aurora-roadmap-summary"><span>Streak 4</span><span>Freezes 1</span></div></header><ol class="aurora-journey-list">'
      + auroraRoadmapDayItemHTML({ day:10, status:'completed', label:'Completed', date:'Jun 19', title:'Completed proof day', taskSummary:'3 tasks', tier:'strong', proofSubmitted:true, open:true })
      + auroraRoadmapDayItemHTML({ day:11, status:'active', label:'Today', date:'Jun 20', title:"Today's proof session", taskSummary:'4 tasks', open:true, isToday:true })
      + auroraRoadmapDayItemHTML({ day:12, status:'locked', label:'Locked', date:'Jun 21', title:'Scheduled proof day', taskSummary:'Unlocks later' })
      + auroraRoadmapDayItemHTML({ day:13, status:'missed', label:'Missed', date:'Jun 22', title:'Missed proof day', taskSummary:'2 tasks', open:true })
      + auroraRoadmapDayItemHTML({ day:14, status:'frozen', label:'Frozen', date:'Jun 23', title:'Frozen proof day', taskSummary:'2 tasks', open:true })
      + '</ol></section></section>',
    '<section><h2>Proof-first Public Progress</h2><p class="lpt-gallery-note">Component example. Static mock values only.</p>'
      + renderProofFirstProgressCard({
        authorName:'Learner',
        pathTitle:'Component example path',
        dayNumber:8,
        proofTitle:'Proof submitted',
        proofSummary:'Completed the practice block and saved a short reflection. No raw evidence URL is exposed.',
        proofState:'submitted',
        tier:'strong',
        metadata:['3 required tasks', '2 proof items'],
      }) + '</section>',
    '<section><h2>Respect Comment Report row</h2><p class="lpt-gallery-note">Component example. Static mock values only.</p>'
      + renderProofActionRow({ respectCount:2, commentCount:1 }) + '</section>',
    '<section><h2>Consistency card states</h2><p class="lpt-gallery-note">Component example. Mock values below are static gallery data, not production metrics.</p><div class="lpt-gallery-row">'
      + renderConsistencyCard({ streak:7, completedDays:12 })
      + renderConsistencyCard({ empty:true })
      + '</div></section>',
    '<section><h2>Path trust card states</h2><p class="lpt-gallery-note">Component example. Static mock values only.</p><div class="lpt-gallery-row">'
      + renderProofMetricCard({ title:'Path trust', value:'12 proof submitted', body:'Every number here is proof-backed.' })
      + renderProofMetricCard({ title:'Path trust', empty:true, body:'Not enough data yet.' })
      + '</div></section>',
    '<section><h2>Aurora shell layout</h2><p class="lpt-gallery-note">Component example. The app shell spans the full viewport, nav anchors left, content gets responsive gutters, rail aligns right.</p>'
      + '<div class="lpt-gallery-row" style="font-size:12px;gap:8px;flex-wrap:wrap">'
      + '<code>--lpt-layout-shell-nav-width: 232px</code>'
      + '<code>--lpt-layout-shell-rail-width: 320px</code>'
      + '<code>--lpt-layout-content-gutter: clamp(20px, 4vw, 64px)</code>'
      + '</div></section>',
    '<section><h2>Daily focus with task rows</h2><p class="lpt-gallery-note">Component example. Task rows use grid with reserved status column for consistent proof-chip alignment.</p>'
      + '<div class="aurora-daily-focus"><span class="aurora-section-kicker">Daily focus</span>'
      + '<div class="aurora-daily-focus-meta"><span>Day 5 of 30</span><span>Jun 22</span></div>'
      + '<h2>Build the daily proof note</h2>'
      + '<div class="aurora-daily-tasks">'
      + '<div class="aurora-daily-task"><span class="aurora-daily-task-check">&#10003;</span><span>Review yesterday lesson</span><span class="aurora-chip aurora-chip-proof">Proof required</span></div>'
      + '<div class="aurora-daily-task"><span class="aurora-daily-task-check"></span><span>Record one proof note with a longer task name that might wrap on smaller screens</span><span class="aurora-chip aurora-chip-proof">Proof required</span></div>'
      + '<div class="aurora-daily-task is-done"><span class="aurora-daily-task-check">&#10003;</span><span>Save the reflection</span></div>'
      + '</div></div></section>',
    '<section><h2>Radius ladder</h2><p class="lpt-gallery-note">Component example. Radius tokens from small (4px) through hero (24px).</p>'
      + '<div class="lpt-gallery-row" style="gap:12px;flex-wrap:wrap;align-items:center">'
      + '<div style="width:48px;height:48px;border:1px solid var(--lpt-color-border-subtle);border-radius:var(--lpt-radius-small);display:grid;place-items:center;font-size:10px">4px</div>'
      + '<div style="width:56px;height:56px;border:1px solid var(--lpt-color-border-subtle);border-radius:var(--lpt-radius-medium);display:grid;place-items:center;font-size:10px">8px</div>'
      + '<div style="width:64px;height:64px;border:1px solid var(--lpt-color-border-subtle);border-radius:var(--lpt-radius-large);display:grid;place-items:center;font-size:10px">12px</div>'
      + '<div style="width:72px;height:72px;border:1px solid var(--lpt-color-border-subtle);border-radius:var(--lpt-radius-xl);display:grid;place-items:center;font-size:10px">16px</div>'
      + '<div style="width:80px;height:80px;border:1px solid var(--lpt-color-border-subtle);border-radius:var(--lpt-radius-panel);display:grid;place-items:center;font-size:10px">20px</div>'
      + '<div style="width:88px;height:88px;border:1px solid var(--lpt-color-border-subtle);border-radius:var(--lpt-radius-hero);display:grid;place-items:center;font-size:10px">24px</div>'
      + '</div></section>',
    '<section><h2>Frame-inset ladder</h2><p class="lpt-gallery-note">Component example. Nested rounded rectangles follow: outer radius &gt; inner radius &gt; control radius. Inner padding is consistent.</p>'
      + '<div style="border:1px solid var(--lpt-color-border-subtle);border-radius:var(--lpt-radius-panel);padding:var(--lpt-layout-panel-inset);background:var(--lpt-color-surface-panel)">'
      + '<div style="border:1px solid var(--lpt-color-border-subtle);border-radius:var(--lpt-radius-xl);padding:var(--lpt-layout-card-inset);background:var(--lpt-color-surface-raised)">'
      + '<div style="border:1px solid var(--lpt-color-border-subtle);border-radius:var(--lpt-radius-large);padding:var(--lpt-layout-row-padding-y) var(--lpt-layout-row-padding-x);background:var(--lpt-color-surface-input);font-size:13px">Control / task row (12px radius, 14px/16px padding)</div>'
      + '</div></div></section>',
    '<section><h2>Content centering</h2><p class="lpt-gallery-note">Component example. Shell content column uses flex centering with margin-inline:auto on inner wrapper. Content stays centered inside the column without re-centering the full shell grid.</p></section>',
    '<section><h2>Search frame system</h2><p class="lpt-gallery-note">Component example. Outer aurora-search-frame uses panel radius (20px). Inner controls use large radius (12px). Filters separated by border-top inside the frame.</p>'
      + '<div class="aurora-search-frame" style="position:static">'
      + '<div class="aurora-discovery-search-row"><span style="flex:1;background:var(--lpt-color-surface-input);border:1px solid var(--lpt-color-border-subtle);border-radius:var(--lpt-radius-large);padding:8px 12px;font-size:13px;color:var(--lpt-color-text-muted)">Search input (large radius)</span>'
      + '<span style="background:var(--lpt-color-surface-input);border:1px solid var(--lpt-color-border-subtle);border-radius:var(--lpt-radius-large);padding:8px 12px;font-size:13px;color:var(--lpt-color-text-muted)">Select (large radius)</span></div>'
      + '</div></section>',
    '<section><h2>Day detail rail card</h2><p class="lpt-gallery-note">Component example. Selected day task list rendered in the right rail below consistency and path trust cards.</p></section>',
    '<section><h2>Focus screen centering</h2><p class="lpt-gallery-note">Component example. Daily focus/session screen uses a 3-zone grid (header / center / bottom) for vertical centering like a lesson screen.</p></section>',
    '<section><h2>Responsive notes</h2><p class="lpt-gallery-note">Mobile (&le;767px): bottom nav, single column, proof chip wraps below. Tablet (768-1023px): side nav, rail stacks below. Laptop (1024-1279px): narrower two-column. Desktop (1280+): full three-column layout with side nav, content, and right rail.</p></section>',
  ];
  return renderAppShell({
    title:'Design system gallery',
    className:'lpt-dev-gallery',
    body:renderCoreColumn({
      ariaLabel:'Design system gallery examples',
      body:renderSessionHeader({ eyebrow:'Internal QA', title:'Core loop components', meta:'Static examples only. No auth, APIs, or user state.' })
        + examples.join(''),
    }),
  });
}
