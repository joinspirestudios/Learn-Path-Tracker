import {
  renderButton, renderCompletionResultPanel, renderDailyScoreCard, renderDailyTaskCard,
  renderEmptyState, renderMetricPill, renderProgressMeter, renderProofActionRow,
  renderProofFirstProgressCard, renderProofMetricCard, renderProofStudioTodayHero,
  renderProofUploadCard, renderRoadmapNode, renderToastBanner, renderConsistencyCard,
} from './core-components.js';
import { renderAppShell, renderCoreColumn, renderSessionHeader } from './core-layout.js';

export function renderDesignSystemGallery(){
  const examples = [
    '<section><h2>Aurora Buttons</h2><p class="lpt-gallery-note">Component example. Static mock values only.</p><div class="lpt-gallery-row">'
      + renderButton({ label:'Primary action', variant:'primary' })
      + renderButton({ label:'Secondary', variant:'secondary' })
      + renderButton({ label:'Ghost', variant:'ghost' })
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
    '<section><h2>Polished public path card</h2><p class="lpt-gallery-note">Component example. Static mock values only.</p>'
      + '<button class="skill-card discovery-card lpt-card-polished" type="button">'
      + '<div class="lpt-card-header sc-header"><span class="sc-creator">By Component author</span></div>'
      + '<div class="lpt-card-title sc-top">A long public path title that wraps without colliding with creator or tags</div>'
      + '<div class="lpt-card-subtitle sc-tag">Creative practice</div>'
      + '<div class="lpt-card-body sc-blurb">Proof-first cards stack metadata, title, description, tags and action regions so nothing floats over anything else.</div>'
      + '<div class="lpt-card-tags discovery-badges"><span>Proof-backed</span><span>Component example</span></div>'
      + '<div class="lpt-card-tags discovery-metrics"><span>3 joined</span><span>2 proof submitted</span></div>'
      + '<div class="lpt-card-actions sc-cta">View &rarr;</div></button></section>',
    '<section><h2>Compact discovery toolbar</h2><p class="lpt-gallery-note">Component example. Static mock values only.</p>'
      + '<div class="discovery-controls discovery-toolbar lpt-discovery-toolbar"><div class="discovery-mainline"><div class="discovery-search-shell lpt-search-primary"><input type="search" aria-label="Search public paths" placeholder="Search by goal, creator or category"/><button class="btn subtle discovery-clear-action" type="button">Clear</button></div><label class="discovery-sort-control"><span>Sort</span><select><option>Recommended</option></select></label><button class="btn subtle discovery-clear-action" type="button">Clear filters</button></div><div class="discovery-filter-chips"><label class="discovery-filter-chip"><span>Category</span><select><option>All</option></select></label><label class="discovery-filter-chip"><span>Proof</span><select><option>All</option></select></label></div></div></section>',
    '<section><h2>Aurora tier chips</h2><p class="lpt-gallery-note">Component example. Static mock values only.</p><div class="lpt-gallery-row"><span class="lpt-result-tier lpt-completion-passed">Passed</span><span class="lpt-result-tier lpt-completion-strong">Strong</span><span class="lpt-result-tier lpt-completion-perfect">Perfect</span></div></section>',
    '<section><h2>RoadmapNode states</h2><p class="lpt-gallery-note">Component example. Static mock values only.</p><div class="proof-roadmap-gallery">'
      + renderRoadmapNode({ day:10, state:'completed', title:'Completed', date:'Jun 19', taskCount:3, tier:'strong', proofSubmitted:true })
      + renderRoadmapNode({ day:11, state:'active', title:'Active day', date:'Jun 20', taskCount:4, cta:"Open today's session" })
      + renderRoadmapNode({ day:12, state:'locked', title:'Locked', date:'Jun 21', taskCount:2 })
      + renderRoadmapNode({ day:13, state:'missed', title:'Missed', date:'Jun 22', taskCount:2 })
      + renderRoadmapNode({ day:14, state:'frozen', title:'Frozen', date:'Jun 23', taskCount:2 })
      + renderRoadmapNode({ day:15, state:'perfect', title:'Perfect', date:'Jun 24', taskCount:4, tier:'perfect', proofSubmitted:true })
      + '</div></section>',
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
    '<section><h2>Consistency card states</h2><p class="lpt-gallery-note">Component example. Static mock values only.</p><div class="lpt-gallery-row">'
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
