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
