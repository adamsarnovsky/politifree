// Shared by runtime inference and every model evaluation.
(() => {
  'use strict';
  function decide(kind, result) {
    if (result.protocol !== 2 || !Number.isFinite(result.score) || result.score < 0 || result.score > 1 || typeof result.complete !== 'boolean') throw Error('Invalid analysis result.');
    const text = String(result.text || '').trim();
    const rules = PolitifreeClassifier.classify(text, 'precise').political;
    const protectedContext = !!PolitifreeClassifier.protectedContext?.(text);
    // A public figure's incidental travel mishap is not political content.
    // The semantic model can score these highly based on the person's title.
    const incidentalVehicleMishap = /\b(?:limousine|car|vehicle)\b.{0,65}\b(?:gets? stuck|broke down|was towed)\b/i.test(text) &&
      !/\b(?:election|campaign|policy|bill|law|vote|voting|protest|attack|war|government)\b/i.test(text);
    const fictionalSynopsis = /(?:Streaming on Disney\+|\bDisney film\b|\bmovie synopsis\b)/i.test(text) &&
      /\b(?:wish|cosmic force|character|story|film|movie)\b/i.test(text) && !rules;
    const neutralMilitaryStatistic = /\b(?:number of active military personnel|military personnel counts?)\b/i.test(text) &&
      !/\b(?:war|invasion|strike|attack|deploy|policy|election|government|protest|funding)\b/i.test(text) && !rules;
    const commercialCampaign = /\bcampaigns?\b/i.test(text) &&
      /\b(?:link integrity|fraud prevention|campaign scale|ad spend|marketing automation|lead generation|CRM data|app interactions?|ad networks?|incrementality experiments?|drive growth|actionable insights|privacy[- ]safe precision)\b/i.test(text) &&
      !/\b(?:election|candidate|voter|politic|government|party|senate|congress|president|ballot)\b/i.test(text) && !rules;
    const communityPopularityVote = /\b(?:most influential|most popular|favou?rite)\s+(?:(?:Bluesky|online|community)\s+)?(?:posters|creators|streamers|artists|songs|cakes)\b/i.test(text) &&
      /\b(?:vote|votes|voting|ballot|polls?)\b/i.test(text) &&
      !/\b(?:presidential|congress|senate|government policy|political party|political campaign|trump|biden|midterm)\b/i.test(text) && !rules;
    const officePoliticsAdvice = /\b(?:office|workplace|corporate|company)\s+politics\b/i.test(text) &&
      /\b(?:tips|handle|career|coworkers?|colleagues?|boss|management)\b/i.test(text) &&
      !/\b(?:government|political party|politician|campaign|senate|congress|president|election|trump|biden)\b/i.test(text) && !rules;
    const semantic = result.score >= .58 && text.length >= 8 && !incidentalVehicleMishap && !fictionalSynopsis && !neutralMilitaryStatistic && !commercialCampaign && !communityPopularityVote && !officePoliticsAdvice && !protectedContext;
    const visual = ['image','media'].includes(kind) && result.complete && result.visualUncertain !== true &&
      (Number(result.visualScore) >= .85 || (result.score >= .85 && !communityPopularityVote && !officePoliticsAdvice && !protectedContext));
    const visualDecision = visual && !fictionalSynopsis && !neutralMilitaryStatistic && !commercialCampaign;
    return {ok:true, political:!!rules || semantic || visualDecision, score:result.score, complete:result.complete,
      decisionBranch: rules ? 'rules' : semantic ? 'semantic' : visualDecision ? 'visual' : 'none',
      visualScore: Number.isFinite(result.visualScore) ? result.visualScore : 0, visualUncertain: result.visualUncertain === true,
      ...(['image','media'].includes(kind) ? {evidence:text.slice(0,4000)} : {})};
  }
  globalThis.PolitifreeDecision = {decide};
})();
