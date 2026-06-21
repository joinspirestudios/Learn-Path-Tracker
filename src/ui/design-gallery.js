import {
  renderButton, renderCompletionResultPanel, renderDailyScoreCard, renderDailyTaskCard,
  renderEmptyState, renderMetricPill, renderProgressMeter, renderProofUploadCard, renderToastBanner,
} from './core-components.js';
import { renderAppShell, renderCoreColumn, renderSessionHeader } from './core-layout.js';

export function renderDesignSystemGallery(){
  const examples = [
    '<section><h2>Buttons</h2><div class="lpt-gallery-row">'
      + renderButton({ label:'Primary action', variant:'primary' })
      + renderButton({ label:'Secondary', variant:'secondary' })
      + renderButton({ label:'Ghost', variant:'ghost' })
      + renderButton({ label:'Destructive', variant:'destructive' })
      + '</div></section>',
    '<section><h2>ProgressMeter</h2>' + renderProgressMeter({ value:68, label:'Gallery progress' }) + '</section>',
    '<section><h2>DailyScoreCard</h2>' + renderDailyScoreCard({ score:68, tier:'passed', copy:'Documented work is moving.' }) + '</section>',
    '<section><h2>DailyTaskCard</h2>' + renderDailyTaskCard({ title:'Read and capture notes', description:'One focused task at a time.', needsEvidence:true, evidenceCount:0 }) + '</section>',
    '<section><h2>ProofUploadCard</h2>' + renderProofUploadCard({ state:'success', title:'Proof saved', body:'The task can now count.' }) + renderProofUploadCard({ state:'error', title:'Proof error', error:'Upload failed.' }) + '</section>',
    '<section><h2>CompletionResultPanel</h2>' + renderCompletionResultPanel({ score:92, tier:'strong', taskSummary:'4 of 5 tasks complete', proofSummary:'2 proof items saved', publishEligible:true }) + '</section>',
    '<section><h2>MetricPills</h2><div class="lpt-gallery-row">' + renderMetricPill({ label:'day streak', value:'7' }) + renderMetricPill({ label:'proof', value:'3' }) + '</div></section>',
    '<section><h2>EmptyState</h2>' + renderEmptyState({ title:'No active path', body:'Create or join a path to start today.', action:renderButton({ label:'Browse Discover', variant:'primary' }) }) + '</section>',
    '<section><h2>ToastBanner</h2>' + renderToastBanner({ message:'Proof saved', variant:'success' }) + '</section>',
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
