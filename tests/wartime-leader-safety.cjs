'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
for (const file of ['classifier', 'decision']) {
  vm.runInThisContext(fs.readFileSync(path.join(root, 'outputs/Politifree-Chrome', `${file}.js`), 'utf8'));
}
const exact = 'HOW VOLODYMYR ZELENSKYY MANAGES TO SURVIVE IN A LITERAL WAR WITHOUT A BALLROOM TO KEEP HIM SAFE IS JUST SHOCKING TO ME.';
const actualOcr = 'HOWVOLODYMRZELENSKYY MANAGESTOSURVIVEINA LITERALWARWITHOUTA BALLROOMTOKEEPHIMSAFE ISJUSTSHOCKINGTOME';
const positive = [
  exact,
  exact.replace('ZELENSKYY', 'ZELENSKY'),
  exact.toLowerCase().replace('literal war', 'armed conflict'),
  'Zelenskyy survives the invasion while sheltering in a bunker.',
  'During the bombardment, the safety of Volodymyr Zelensky is a concern.',
  'Vladimir Putin orders his evacuation during missile attacks.',
  'Benjamin Netanyahu uses an air raid shelter during the war.',
  `Voices of Democratic Women\n${exact}`,
  exact.replaceAll(' ', '\n'),
  actualOcr,
  actualOcr.replaceAll(' ', ''),
  'ZELENSKYYKEEPSHIMSAFE DURINGMISSILEATTACKS',
  'VLADIMIRPUTINSURVIVES ANARMEDCONFLICT',
  'BENJAMINNETANYAHUEVACUATES DURINGAIRSTRIKES',
];
const negative = [
  'Volodymyr Zelenskyy',
  'Voices of Democratic Women celebrates a birthday.',
  'Zelenskyy shares a recipe for dinner.',
  'Zelenskyy survives a difficult workout.',
  'Zelenskyy attends a ballroom dance.',
  'Zelenskyy survives a bidding war at the charity auction.',
  'Zelenskyy keeps his savings safe during a price war.',
  'Zelenskyy survives a war of words with his neighbor.',
  'My grandfather survived the war.',
  'Zelenskyy watches War and Peace at home.',
  'A fictional Zelenskyy survives a war.',
  'In this strategy game, Zelenskyy survives the war.',
  'Historical fiction. Zelenskyy survives the war.',
  'The historical drama shows Zelenskyy surviving a war.',
  'A movie character named Zelensky survives the war.',
  'In my novel, Vladimir Putin survives a war.',
  'The actor playing Benjamin Netanyahu uses a bunker during the war film.',
  'Zelenskyy enjoys a safe drive. A war survival story is next on the radio.',
  'ZELENSKYYENJOYSACTUALWARCOFFEE',
  'ZELENSKYYMANAGESTOSURVIVEAWORKOUT',
  'UNKNOWNPERSONSURVIVESALITERALWAR',
  'ZELENSKYYWATCHESAWARFILMABOUTSURVIVAL',
  'HISTORICALFICTION ZELENSKYYMANAGESTOSURVIVEALITERALWAR',
  'HISTORICALFICTION. Zelenskyy survives a literal war.',
  'STRATEGYGAME. Zelenskyy survives a literal war.',
  'HISTORICALDRAMA ZELENSKYYMANAGESTOSURVIVEALITERALWAR',
  'STRATEGYGAME ZELENSKYYMANAGESTOSURVIVEALITERALWAR',
  'WORLDOfWARCRAFT ZELENSKYYMANAGESTOSURVIVEALITERALWAR',
  'ZELENSKYYMANAGESTOSURVIVEABIDDINGWAR',
  'ZELENSKYYKEEPSHIMSAFE DURINGATRADEWAR',
  'ZELENSKYYMANAGESTOSURVIVEALITERALWAROFWORDS',
  'VOICESOFDEMOCRATICWOMEN CELEBRATESABIRTHDAY',
  'ZELENSKYYMANAGESTOSURVIVE. ALITERALWARISDESCRIBEDINANOTHERITEM',
];
let decisions = 0;
for (const [texts, expected] of [[positive, true], [negative, false]]) {
  for (const text of texts) {
    assert.equal(PolitifreeClassifier.classify(text, 'precise').political, expected, text);
    // Even uncertain visuals and weak semantic evidence must honor text rules.
    for (const score of [0, .45, .57]) {
      const result = PolitifreeDecision.decide('image', {
        protocol: 2, text, score, complete: false, visualScore: .45, visualUncertain: true,
      });
      assert.equal(result.political, expected, `${score}: ${text}`);
      assert.equal(result.complete, false);
      decisions++;
    }
  }
}
assert.equal(PolitifreeClassifier.classify(exact, 'precise').reason, 'public-leader-wartime-safety');
assert.equal(PolitifreeClassifier.classify(actualOcr, 'precise').reason, 'public-leader-wartime-safety-ocr');
console.log(`PASS ${positive.length} political cases, ${negative.length} ordinary/fictional controls, ${decisions} image decisions`);
