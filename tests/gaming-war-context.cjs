'use strict';
const fs = require('node:fs'), assert = require('node:assert/strict');
require('../outputs/Politifree-Chrome/classifier.js');
require('../outputs/Politifree-Chrome/decision.js');
// Visual transcription, not a claim that raw native OCR was logged. The frame
// at 6.093662s visibly says BOMBING IRAN; runtime's accepted 6.075s frame
// independently reported rules=true, score=.132336, visualScore=0.
const evidence = 'outputs/audit-evidence/live-feeds-v0.7.4/';
// Keep the public regression independent of private account screenshots.
const accepted = {source:'video-frame',branch:'rules',score:.132336,visualScore:0,sampleTime:6.075};
if(fs.existsSync(evidence+'short-trace-loop-frame.json')) {
  assert(fs.existsSync(evidence+'short-paused-six-seconds.jpg'));
  const trace = JSON.parse(fs.readFileSync(evidence+'short-trace-loop-frame.json','utf8'));
  const actual = JSON.parse(trace.videos[0].owners[0].analysis);
  for(const key of Object.keys(accepted)) assert.equal(actual[key],accepted[key]);
}
const title = 'Asmongold brought WAR to WoW Forever #olympus';
const soundtrack = 'WAR IS BACK IN WARCRAFT - Asmongold Olympus Guild [WoW The Musical #3]';
const cases = [
  {text:title+'\nBOMBING IRAN', political:true},
  {text:soundtrack+'\nBOMBING IRAN', political:true},
  {text:title, political:false},
  {text:soundtrack, political:false},
  {text:title+'\nRAIDING ORGRIMMAR', political:false},
  {text:'World of Warcraft gameplay: the Horde and Alliance fight a fictional war in Azeroth.', political:false},
  {text:'A fantasy guild wages war against dragons in a role-playing game.', political:false}
];
for(const {text,political} of cases) {
  const rules = PolitifreeClassifier.classify(text,'precise');
  const decision = PolitifreeDecision.decide('image',{protocol:2,text,score:accepted.score,visualScore:0,visualUncertain:false,complete:true});
  assert.equal(rules.political,political,text);
  assert.equal(decision.political,political,text);
  if(political) assert.equal(decision.decisionBranch,'rules');
}
console.log('PASS real-country bombing overlay plus gaming war caption filters; ordinary fantasy conflict and original game titles remain visible (7 cases)');
