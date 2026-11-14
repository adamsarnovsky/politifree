(() => {
  const strong = [
    /\b(?:far[- ]right|far[- ]left)\b.{0,100}\b(?:congress|parliament|elections?|political|party|government|senate)\b|\b(?:congress|parliament|elections?|political|party|government|senate)\b.{0,100}\b(?:far[- ]right|far[- ]left)\b/i,
    /\b(?:debate)\b.{0,70}\b(?:governor|senate|congress|CD\d)|\b(?:governor|Gov\.|Sen\.)\s.{0,70}\b(?:debate|face-off)\b/i,
    /\b(?:protests?|protesters?|demonstrations?)\b.{0,90}\b(?:public funding|government funding|education funding|investment in education|state repression)\b/i,
    /\b(?:elections?(?!\s+(?:for|of)\s+(?:the\s+)?(?:best|favou?rite)\s+(?:pizza|food|song|movie|pet|cake)\b)|electoral college|ballot measure|secret ballot|campaign finance|political campaign)\b/i,
    /\b(?:abolish|overthrow|restore|defend|support|oppose)\b.{0,60}\bmonarchy\b|\b(?:state repression|government repression)\b/i,
    /\btax(?:ing)?\s+(?:the\s+)?(?:rich|wealthy|billionaires|millionaires)\b.{0,80}\b(?:fund|funding|public|schools|healthcare|government)\b/i,
    /\b(?:vote|voting|voter|polls?)\b.{0,50}\b(?:president|senate|congress|governor|mayor|election|candidate|party)\b/i,
    /\b(?:president|senator|congress(?:man|woman|person)?|governor|mayor|candidate)\b.{0,50}\b(?:vote|election|campaign|party|bill|law|policy)\b/i,
    /\b(?:democrat|republican|liberal|conservative|left[- ]wing|right[- ]wing)\b.{0,45}\b(?:party|candidate|campaign|vote|election|policy|politic)\b/i,
    /\b(?:legislation|legislature|parliament|supreme court|public policy|political party|government shutdown|political action committee)\b/i,
    /\b(?:impeach\w*|filibuster\w*|gerrymander\w*|constituent|political endorsement|political ad|political debate|white house|pentagon|prime minister|senate hearing|UK MPs)\b/i,
    /\b(?:donald trump|joe biden|kamala harris|pete hegseth|vladimir putin|benjamin netanyahu|keir starmer|emmanuel macron|anti-trump|pro-trump)\b/i,
    /\b(?:trump|biden)\b(?!\s+(?:card|cards|suit|suits|in bridge|in poker))|\bno kings\b/i,
    /\b(?:politicians?|political|politics|congressional|executive order|Zelensky\w*|Mamdani|Ken Paxton|Karoline Leavitt|JD Vance|J\.D\. Vance|Charlie Kirk|Steven Crowder|StevenCrowder|Infowars|The Young Turks|Occupy Democrats|Turning Point USA|Democratic policies|communism|socialis[mt]s?|democracy|Hannity|Laura Ingraham|Tom Homan|Mike Johnson|RFK Jr\.?|Robert F\.? Kennedy|anti-capitalis[mt]|national security|TPUSA|Rahm Emanuel|Chuck Schumer|Jasmine Crockett|Spanberger|Talarico|Assad|Houthis|State Department|federal deficit|red state|blue state|debate week|Jack Smith|Barack Obama|Capitol Hill|presidential|lawmakers?|midterm elections|midterms|Free Palestine|immigration agent|military strike|anti-Israel|anti-transgender|Republicans?|Democrats?|Jesse Watters|Watters, Tarlov)\b/i,
    /\b(?:democrats?|republicans?|liberals?|conservatives?|GOP)\b.{0,60}\b(?:pledge|promise|campaign|party|election|senate|policy|policies|vote|air defence|debt debate)\b/i,
    /\b(?:vote for me|elect me|vote them out|vote him out|vote her out)\b/i,
    /\b(?:make america great again|maga|black lives matter|all lives matter|defund the police|from the river to the sea|i stand with (?:israel|palestine|ukraine))\b/i
  ];
  const contextual = [
    /\bpolitic(?:s|al|ally)\b/i,
    /\b(?:government|governmental|polic(?:y|ies)|partisan|bipartisan|referendum|protest|activis[mt]|liberals?|conservatives?)\b/i,
    /\b(?:war|conflict|sanctions|immigration|abortion|climate|tax(?:es|ation)?|health ?care|gun control|firearms?|troops?|candidate|election|police|civil rights|trans rights|lgbtq|union|minimum wage|border|israel|palestine|ukraine|religious freedom|racial justice)\b/i
  ];
  const politicalTerms = /\b(?:election|candidates?|campaign|politic|senators?|congress|governors?|mayors?|democrats?|republicans?|liberals?|conservatives?|parliament|legislation|votes?|ballots?|government|polic(?:y|ies)|partisan|referendum|protests?|activism|sanctions|immigration|abortion|climate|war|conflict|troops?|firearms?|gun control|tax(?:es|ation)?|health ?care)\b/i;
  const nonpoliticalCues = /\b(?:elections? (?:for|of) (?:the )?(?:best|favou?rite) (?:pizza|food|song|movie|pet|cake)\b|how to vote in a game|vote for your favorite|president of the company|class president|student council|political science textbook|historical fiction)\b/i;
  const politicalActors = /\b(?:government|presidents?|administration|senators?|congress|governors?|mayors?|parliament|political parties|democrats?|republicans?|liberals?|conservatives?)\b/i;
  const publicIssues = /\b(?:immigration|abortion|climate change|climate policy|tax(?:es|ation)|health ?care|gun control|firearms?|war|sanctions|voting rights|election|government|political parties|democrats?|republicans?|liberals?|conservatives?|police|civil rights|trans rights|lgbtq|union|minimum wage|border|israel|palestine|ukraine|religious freedom|racial justice)\b/i;
  const advocacy = /\b(?:support|oppose|opposed|against|ban|legalize|abolish|protect|defend|fight|demand|urge|vote|elect|condemn|hate|destroy(?:ing)?|ruin(?:ing)?|dangerous|terrible|awful|incompetent|corrupt|disgraceful|must|should|resign|stand with|stand against)\b/i;
  const partyOpinion = /\b(?:democrats?|republicans?|liberals?|conservatives?)\b.{0,100}\b(?:destroy(?:ing)?|ruin(?:ing)?|terrible|dangerous|corrupt|polic(?:y|ies)|must|should|hate|support|oppose)\b/i;

  function protectedContext(text) {
    const subject = String(text || '').replace(/#officepolitics\b/gi, 'office politics');
    if (/#(?:free[-_]?palestine|free[-_]?gaza|ceasefire[-_]?now|stand[-_]?with[-_]?palestine|political(?:opinion|news|debate|activism|propaganda)|(?:us|uk|indian|american)politics)\b/i.test(subject)) return null;
    const realPolitics = /\b(?:trump(?!\s+(?:cards?|suits?))|biden|kamala harris|putin|netanyahu|Republicans?|Democrats?|GOP|Republican Party|Democratic Party|MAGA|make america great again|free palestine|free gaza|ceasefire now|defund the police|black lives matter|racial justice|national politics|real[- ]world politics|IRL politics|presidential election|public policy|immigration (?:law|policy)|our government|government should)\b/i;
    if (realPolitics.test(subject)) return null;
    const governance = /\b(?:Congress|Senate|Parliament)\b.{0,80}\b(?:passes?|bans?|hearings?|debates?|bill|legislation|questions?)\b/i;
    if (subject.split(/[.!?\n]+/).some(sentence => governance.test(sentence) && !/\b(?:fictional|in (?:this|the) game|in my (?:historical|fantasy) novel)\b/i.test(sentence))) return null;
    if (/\b(?:office|workplace|corporate|company)\s+#?politics\b/i.test(subject) && !/\b(?:Congress|Senate|Parliament|legislation|political party)\b/i.test(subject)) return 'workplace-politics';
    const game = /\b(?:Total War|Rome 2|Stellaris|EVE(?: Online)?|D&D|DnD|Dungeons & Dragons|Minecraft|Roblox|Star Wars|Suzerain|Game of Thrones|tabletop RPG|role[- ]playing game|RPG campaigns?|(?:political|government) (?:simulation|simulator|strategy) games?)\b/i;
    const mechanics = /\b(?:factions?|guide|tips|gameplay|game mechanics|RPG campaigns?|campaign \d|simulat(?:ion|or) games?|strategy games?|game worlds?|political parties|political compass|D&D game)\b/i;
    if (game.test(subject) && mechanics.test(subject)) return 'fictional-game-guide';
    return null;
  }
  function precise(subject, context = {}) {
    // A political movement's leadership is political even without an election
    // keyword. Require the leadership phrase; names or "kingmaker" alone are not enough.
    if (/\b(?:MAGA|GOP|Democratic Party|Republican Party)[’']?s?\s+(?:kingmakers?|leaders?|leadership|donors?|strategists?)\b/i.test(subject)) {
      return {political: true, score: 0.99, reason: 'political-movement-leadership'};
    }
    if (/\b(?:is|are|was|were)\s+(?:just\s+)?(?:an?\s+)?(?:leftist|right[- ]winger|fascist|communist|socialist)\b/i.test(subject) &&
        !/\b(?:fictional|movie|novel|character|historical fiction)\b/i.test(subject)) {
      return {political: true, score: 0.99, reason: 'explicit-ideology-label'};
    }
    if (/\bCampaign MiddleEast\b/i.test(subject) && /\b(?:contract award|advertis\w*|tech platform)\b/i.test(subject) &&
        !/\b(?:elections?|candidates?|congress|parliament|political campaign|government policy)\b/i.test(subject)) {
      return {political: false, score: 0, reason: 'commercial-campaign-publication'};
    }
    // German "war" means "was" in this Formula 1 headline; it does not
    // describe armed conflict in Malaysia.
    if (/\bFIA[- ]Regeln\b/i.test(subject) && /\b(?:Aston Martin|Formel|Formula|Rennen|Malaysia)\b/i.test(subject) &&
        !/\b(?:elections?|candidates?|congress|parliament|political campaign|government policy|trump|biden)\b/i.test(subject)) {
      return {political: false, score: 0, reason: 'motorsport-rules'};
    }
    if (/\bSpeaker\s+(?:of the House\s+)?[A-Z][a-z]+\b.{0,110}\b(?:defund (?:the )?police|election|candidate|campaign|votes?|polls?)\b/i.test(subject) ||
        /\bTrump\b.{0,110}\b(?:special envoy|administration appointment|appoints?|nominates?)\b/i.test(subject) ||
        /\bFetterman\b.{0,100}\b(?:Republicans?|Democrats?|own party)\b.{0,60}\bpolls?\b/i.test(subject) ||
        /\b(?:DNC|RNC|Democratic National Committee|Republican National Committee)\b.{0,110}\b(?:Trump|Biden|election|campaign|political ads?)\b/i.test(subject) ||
        /\bvoters?\b.{0,85}\b(?:House|Senate|congressional|governor)\s+race\b/i.test(subject) ||
        /\bTrump\b.{0,85}\b(?:hand|present|award|bestow)\w*\b.{0,85}\b(?:honou?r|award|medal)\b/i.test(subject)) {
      return {political: true, score: 0.99, reason: 'explicit-official-or-party-news'};
    }
    if (/\b(?:applicant tracking system|recruiting CRM)\b/i.test(subject) &&
        /\b(?:candidate relationship management|collaborative hiring|hire top talent|enterprise teams)\b/i.test(subject) &&
        !/\b(?:elections?|political campaign|congress|parliament|government policy|trump|biden)\b/i.test(subject)) {
      return {political: false, score: 0, reason: 'recruiting-software'};
    }
    if (((/\b(?:Internet Crime Complaint Center|IC3|cyber-enabled crime)\b/i.test(subject) &&
          /\b(?:FBI|scammers?|fraud|crime|law enforcement|complaints?)\b/i.test(subject)) ||
         (/\bFBI\b/i.test(subject) && /\b(?:reported crimes|field offices|crime reports?)\b/i.test(subject)) ||
         (/\bscammers? impersonating\b/i.test(subject) && /\b(?:law enforcement|government officials?)\b/i.test(subject))) &&
        !/\b(?:elections?|political campaign|congress|parliament|government policy|trump|biden)\b/i.test(subject)) {
      return {political: false, score: 0, reason: 'cybercrime-reporting'};
    }
    if (/\b(?:Title II|ADA)\b/i.test(subject) && /\b(?:web and mobile accessibility|PDF accessibility|WCAG|accessibility compliance dates)\b/i.test(subject) &&
        !/\b(?:elections?|political campaign|congress|parliament|government policy|trump|biden)\b/i.test(subject)) {
      return {political: false, score: 0, reason: 'accessibility-compliance-service'};
    }
    // Privacy disclosures enumerate sensitive data categories; mentioning a
    // person's political opinion in that list is not a political post.
    if (/\b(?:personal data|sensitive data|data processing|privacy (?:notice|policy))\b/i.test(subject) &&
        /\bpolitical (?:opinions?|affiliation|beliefs?)\b/i.test(subject) &&
        !/\b(?:elections?|candidates?|trump|biden|congress|parliament|government policy|political campaign)\b/i.test(subject)) {
      return {political: false, score: 0, reason: 'privacy-data-disclosure'};
    }
    if (/\b(?:EU[- ]US DPF|data privacy framework)\b/i.test(subject) && /\b(?:policy|privacy|agreement)\b/i.test(subject)) {
      return {political: false, score: 0, reason: 'privacy-framework-reference'};
    }
    if (/\b(?:digital inclusion|web accessibility|screen reader)\b/i.test(subject) &&
        /\b(?:read the page|public services|accessible content|meet the law)\b/i.test(subject) &&
        !/\b(?:elections?|candidates?|congress|parliament|political campaign|government policy|lawmakers?|legislation)\b/i.test(subject)) {
      return {political: false, score: 0, reason: 'accessibility-service'};
    }
    if (/\bexpanded access\b/i.test(subject) && /\b(?:FDA|Food and Drug Administration)\b/i.test(subject) &&
        /\b(?:patients?|clinical trials?|drug|biological product)\b/i.test(subject) &&
        !/\b(?:elections?|congress|senate|president|lawmakers?|government policy)\b/i.test(subject)) {
      return {political: false, score: 0, reason: 'clinical-trial-definition'};
    }
    if (/\b(?:studio ghibli|animated film|movie trailer)\b/i.test(subject) &&
        /\b(?:trailer|film|movie|fictional)\b/i.test(subject) &&
        !/\b(?:elections?|congress|senate|trump|biden|political campaign)\b/i.test(subject)) {
      return {political: false, score: 0, reason: 'fictional-film-promotion'};
    }
    if (/\bcreative platform\b/i.test(subject) && /\b(?:ad|advertising)\b/i.test(subject) &&
        /\bcampaign\b/i.test(subject) &&
        !/\b(?:elections?|candidates?|trump|biden|congress|parliament|political campaign)\b/i.test(subject)) {
      return {political: false, score: 0, reason: 'creative-advertising-campaign'};
    }
    if (/\b(?:midterms?(?:\s+20\d{2})?|Talarico|Social Security|Carolinas?)\b/i.test(subject) &&
        (/(?:\bmidterms?(?:\s+20\d{2})?\b.{0,120}\b(?:vote|voters?|save (?:our|the) country|election)|\b(?:vote|voters?|save (?:our|the) country|election)\b.{0,120}\bmidterms?\b)/i.test(subject) ||
         /\bTalarico\b.{0,90}\b(?:ahead by \d+ (?:points?|%)|vote|polls?|election|cheat)\b/i.test(subject) ||
         /\bSocial Security\b.{0,140}\b(?:federal deficit|cut(?:ting|s)? Social Security|reduce the deficit)\b/i.test(subject) ||
         /\b(?:north|south) carolina\b.{0,180}\bvote\b.{0,120}\b(?:turn|flip)\b.{0,40}\b(?:blue|red)\b/i.test(subject))) {
      return {political: true, score: 0.99, reason: 'explicit-electoral-or-public-program-opinion'};
    }
    // The lower-case pronoun "us" must not be read as the country abbreviation
    // in proximity to ordinary bills or policies. Keep uppercase US and U.S.
    subject = subject.replace(/\bus\b/g, ' ');
    // Keep official titles attached to their names when splitting sentences.
    subject = subject.replace(/\b(Sen|Rep|Gov)\./g, '$1');
    // In sports copy SEC commonly means the Southeastern Conference.
    subject = subject.replace(/\bSEC(?=\s+(?:college|football|basketball|baseball|sports?|rivalry|feud))\b/g, 'sports conference');
    // Remove the literal phrase only, so unrelated politics elsewhere in the
    // same sentence still counts. A country name does not turn furniture,
    // software releases, consumer policies or an invoice into public affairs.
    subject = subject.replace(/\b(?:(?:voltage|current|pressure|temperature|speed) regulat(?:ors?|ion)|(?:kitchen|bathroom|storage|filing|display) cabinets?|release candidates?|(?:cancellation|refund|return|shipping|privacy|insurance|warranty) polic(?:y|ies)|(?:restaurant|hotel|dinner|grocery|electricity|utility|medical|phone) bills?)\b/gi, ' ');
    subject = subject.replace(/\b(?:advertising|marketing|email|product) campaigns?|\bcampaign (?:data|performance|analytics|metrics|management|goals?|planning|social content|creative|optimization)|\b(?:monetary|interest[- ]rate|central[- ]bank) polic(?:y|ies)|\bpolicy rates?\b|\bprivacy\s*(?:&|and)\s*polic(?:y|ies)\b|\bAI bill\b/gi, ' ');
    subject = subject.replace(/\b(?:an official website of the United States government|official websites use \.gov|government organization|government services)\b/gi, ' ');
    // Product approval/waiver coverage is not an advocacy or public-policy story.
    subject = subject.replace(/\b(?:FCC )?ban waiver\b/gi, ' ');
    subject = subject.replace(/\b(?:ex[- ]|former )DOJ official\b/gi, 'former official');
    // Journal titles on research cards are metadata, not the article's subject.
    subject = subject.replace(/\bApplied Spatial Analysis and Policy\b/gi, 'Applied Spatial Analysis Journal');
    if (/\bconsumer price index\b/i.test(subject) && /\binflation\b/i.test(subject) &&
        !/\b(?:election|candidate|campaign|congress|senate|government|tariffs?|legislation|bill|voting)\b/i.test(subject)) {
      return {political: false, score: 0, reason: 'economic-measure-explainer'};
    }
    if (/\b(?:DIY fertilizer|fertilizer is a blessing|farmers face steep prices)\b/i.test(subject) &&
        !/\b(?:election|candidate|campaign|congress|senate|government|legislation|bill|voting|president|minister)\b/i.test(subject)) {
      return {political: false, score: 0, reason: 'agricultural-story'};
    }
    if (/\b(?:collection|call for papers)\b/i.test(subject) && /\b(?:submissions?|submission deadline)\b/i.test(subject) &&
        !/\b(?:election|candidate|campaign|political party|government|war|protest)\b/i.test(subject)) {
      return {political: false, score: 0, reason: 'academic-call-for-papers'};
    }
    if (/\bnews about\b.{0,90}\bpolitics\b.{0,90}\b(?:crime|education|celebrities|weather|economy)\b/i.test(subject)) {
      return {political: false, score: 0, reason: 'mixed-news-site-description'};
    }
    // A topic word alone is not sufficient: medical, business, gaming and
    // educational material regularly shares words with political discussion.
    const videoTitle = context.platform === 'youtube' ? String(context.videoTitle || '') : '';
    if (/\bpolitic(?:s|al|ians?)\b/i.test(videoTitle) &&
        !/\b(?:office|workplace|corporate|company)\s+politics\b|\b(?:fictional|fiction|novel|gaming|video game|strategy game|textbook|privacy)\b/i.test(videoTitle)) {
      return {political: true, score: 0.99, reason: 'explicit-political-video-title'};
    }
    const topic = /\b(?:politic(?:s|al)|election campaign|presidential|parliamentary|senate|congress|government|legislation|immigration law|campaign finance)\b/i;
    const named = /\b(?:donald trump|joe biden|kamala harris|barack obama|vladimir putin|benjamin netanyahu|keir starmer|emmanuel macron|marine le pen|narendra modi|akhilesh yadav|candace owens|jared kushner|kushner|trump(?!\s+(?:cards?|suits?))|biden)\b/i;
    const party = /\b(?:democrats|republicans|GOP|Democratic Party|Republican Party)\b/i;
    const opinion = /\b(?:vote|elect|campaign|elections?|policies|policy|corrupt(?:ion|ed)?|destroy(?:ing|ed)?|ruin(?:ing|ed)?|hate|support|oppose|endorse|endorsed|mandate)\b/i;
    const issue = /\b(?:abortion rights|reproductive rights|gun control|firearms?|immigration (?:law|policy)|voting rights|climate policy|government funding|public funding|state repression)\b/i;
    const action = /\b(?:support|oppose|ban|legalize|abolish|demand|urge|votes?|voted|elect|condemn|must|should|protect|defend|hate)\b/i;
    const government = /\b(?:government|senate|congress|parliament|senator|governor|prime minister|president of the United States)\b/i;
    const publicAction = /\b(?:bill|legislation|election|campaign|voters|executive order|shutdown|impeachment|filibuster|gerrymandering|law)\b/i;
    const explicit = /\b(?:political (?:campaign|debate|party|opinion|propaganda|endorsement|advertisement|speech)|political election campaign rally|political protest demanding government policy changes|political propaganda poster|televised political debate between election candidates|politician giving an official government press conference|(?:donald trump|joe biden|kamala harris|vladimir putin|barack obama) speaking about politics|presidential election|parliamentary election|election coverage|campaign finance|electoral college|vote them out|vote (?:him|her) out|make america great again|defund the police|free palestine|anti[- ]racis(?:m|t)|racial justice|reggae against racism)\b/i;
    const politicalSlogan = /\b(?:vote in november|no human is illegal|from the river to the sea(?:,? palestine will be free)?|no justice[, ]+no peace|land back now|tax the rich|people over profit|ceasefire now|immigrants (?:are )?welcome here|save our democracy|defend democracy from authoritarianism|no more billionaire rule|health ?care for all|workers deserve a living wage|free speech is under attack|(?:our )?rights are not negotiable|there is no planet b|choose compassion over cruelty at the ballot box|stop funding (?:this )?war)\b/i;
    const unrelatedSloganContext = /\b(?:game|gaming|fictional|sci[- ]fi|tabletop rpg|ice cream|caramel|flavou?r|patients?|clinic|language[- ]exchange|podcast|playlist|astronomy|kayak|bake sale|book club|chess club)\b/i;
    const politicalOfficeMilitaryOpinion = /\b(?:prime minister|president|government|parliament)\b.{0,70}\b(?:right call|sending|sent|deploy(?:ing|ed)?|troops?|military strike)\b/i;
    const foreignAffairsReporting = /\b(?:israel(?:i)?|palestin(?:e|ian)|gaza|ukraine|russia|iran|taiwan|china|hamas|hezbollah)\b.{0,80}\b(?:polic(?:y|ies)|conflict|war|ceasefire|occupation|invasion|sanctions|bombardment|military action|settlement)\b|\b(?:polic(?:y|ies)|conflict|war|ceasefire|occupation|invasion|sanctions|bombardment|military action|settlement)\b.{0,80}\b(?:israel(?:i)?|palestin(?:e|ian)|gaza|ukraine|russia|iran|taiwan|china|hamas|hezbollah)\b/i;
    const internationalPoliticalNews = /\b(?:united states|u\.?s\.?|united kingdom|u\.?k\.?|france|germany|italy|spain|poland|ukraine|russia|israel|palestine|gaza|iran|iraq|syria|lebanon|saudi arabia|yemen|turkey|turkiye|china|taiwan|hong kong|japan|india|pakistan|bangladesh|myanmar|south korea|north korea|philippines|indonesia|australia|canada|mexico|brazil|argentina|venezuela|cuba|nigeria|south africa|egypt|ethiopia|kenya|sudan|somalia|new zealand|norway|denmark|sweden|finland|ireland|netherlands|belgium|switzerland|austria|greece|portugal|romania|hungary|czech(?:ia| republic)|iceland|colombia|chile|peru|bolivia|uruguay|paraguay|guatemala|honduras|el salvador|panama|costa rica|afghanistan|kazakhstan|uzbekistan|nepal|sri lanka|thailand|malaysia|singapore|cambodia|laos|mongolia|armenia|azerbaijan|georgia|belarus)\b.{0,80}\b(?:politic(?:s|al)|parliament|election|candidate|legislation|lawmakers?|bill|policy|polic(?:y|ies)|supreme court|military action|war|diplomac\w*|ceasefire|sanctions|opposition party|ruling party|referendum|voting rights|bans?)\b|\b(?:politic(?:s|al)|parliament|election|candidate|legislation|lawmakers?|bill|policy|polic(?:y|ies)|supreme court|military action|war|diplomac\w*|ceasefire|sanctions|opposition party|ruling party|referendum|voting rights|bans?)\b.{0,80}\b(?:united states|u\.?s\.?|united kingdom|u\.?k\.?|france|germany|italy|spain|poland|ukraine|russia|israel|palestine|gaza|iran|iraq|syria|lebanon|saudi arabia|yemen|turkey|turkiye|china|taiwan|hong kong|japan|india|pakistan|bangladesh|myanmar|south korea|north korea|philippines|indonesia|australia|canada|mexico|brazil|argentina|venezuela|cuba|nigeria|south africa|egypt|ethiopia|kenya|sudan|somalia|new zealand|norway|denmark|sweden|finland|ireland|netherlands|belgium|switzerland|austria|greece|portugal|romania|hungary|czech(?:ia| republic)|iceland|colombia|chile|peru|bolivia|uruguay|paraguay|guatemala|honduras|el salvador|panama|costa rica|afghanistan|kazakhstan|uzbekistan|nepal|sri lanka|thailand|malaysia|singapore|cambodia|laos|mongolia|armenia|azerbaijan|georgia|belarus)\b/i;
    const internationalEntertainmentOrSports = /\b(?:football|soccer|baseball|basketball|hockey|cricket|rugby|sports? team|club president|tv show|television|courtroom drama|legal drama|drama series|sitcom|fictional|fiction|novel|character|role[- ]playing game|strategy game)\b/i;
    const civicInfrastructureProtest = /\bprotest(?:s|ers|er)?\b.{0,100}\b(?:local|city|county|planning|permit|construction|development|data cent(?:er|re)|pipeline|housing|zoning|government|public project)\b|\b(?:local|city|county|planning|permit|construction|development|data cent(?:er|re)|pipeline|housing|zoning|government|public project)\b.{0,100}\bprotest(?:s|ers|er)?\b/i;
    const legislativeNews = /\b(?:lawmakers?|legislators?|parliament|legislature|congress|senate)\b.{0,100}\b(?:introduc\w*|new laws?|multiple laws?|bill|repeal|vote|passed|pass|curb|limit|ban|regulat\w*|propos\w*)\b/i;
    const regulatoryAgencyNews = /\b(?:federal communications commission|\bFCC\b|\bSEC\b|\bFTC\b|\bEPA\b|\bDOJ\b|department of justice|\bFBI\b|\bFDA\b|\bNLRB\b|\bFEC\b)\b.{0,100}\b(?:sue|lawsuit|repeal|rule|regulat\w*|ban|order|law|policy|cap|bill|government|probe|investigat\w*)\b/i;
    const januarySixPoliticalCase = /\b(?:jan(?:uary)?\.?\s*6(?:th)?|capitol attack|pipe bomb(?:ing)?)\b.{0,100}\b(?:fbi|case|trial|investigation|election|congress|politic|capitol)\b|\b(?:fbi|case|trial|investigation|election|congress|politic|capitol)\b.{0,100}\b(?:jan(?:uary)?\.?\s*6(?:th)?|capitol attack|pipe bomb(?:ing)?)\b/i;
    const politicalRaceHeadline = /\b(?:midterms? news|midterm elections?|(?:u\.?s\.?\s+)?senate debate|congressional debate|gubernatorial debate|parliamentary debate)\b/i;
    const fictionalAffairsContext = /\b(?:fictional|sci[- ]fi|tabletop rpg|role[- ]playing game|strategy game|history quiz|historical novel|alternate history)\b/i;
    const fictionalGameFrame = /\bin (?:this|the) (?:strategy|role[- ]playing|tabletop) game\b/i;
    const explicitCivicVideo = /\b(?:presidential (?:candidates?|nomination|debate|field|survey|polls?|primaries|nominee)|president election|local government elections?|(?:senate|congressional|confirmation) hearings?|congressional testimony|contempt of Congress|House hearing(?!\s+aids?\b)|opposition leader|political (?:rally|event|violence)|MAGA rally|VP debate|Waqf Bill Debate|YSRCP leaders|House Oversight Committee|House committee.{0,45}hearing|GOP debate|Trump administration|Ken Paxton.{0,65}campaign|school board meeting.{0,65}Pride Month)\b/i;
    const officialHearing = /\b(?:Sen\.?\s+(?:Josh\s+|John\s+)?(?:Hawley|Kennedy)|Mitch McConnell|Pete Hegseth)\b.{0,120}\b(?:hearing|subpoenas?|questions|spending)\b/i;
    const politicalVideoContext = /\b(?:military.{0,45}(?:getting|becoming|is) political|Trump.{0,65}(?:constitution|rally|Iran warning|protesters?.{0,35}rally)|Congress.{0,65}(?:grilled|questions|asks|hearing)|apologizes to Congress|Congressman.{0,90}question|(?:grilled|testif(?:y|ies|ied)|lied before|hearing|before).{0,65}Congress|Charlie Kirk.{0,65}(?:debate|liberal|political event)|(?:enter|entering|joins?|joining) politics|Secretary of State.{0,120}(?:Xi|Putin|diplomacy|foreign policy)|Hakainde Hichilema.{0,90}(?:vote|election)|campaign.{0,100}TVK|TVK.{0,100}campaign|EPS receives.{0,65}during campaign|(?:backlash|criticiz\w*|president|senator).{0,80}campaign rally|congressional phone records|TVK campaign|politicians?\s+(?:lie|try to relate)|president.{0,45}cancel.{0,45}election|Pentagon official.{0,65}hearing)\b/i;
    const multilingualElection = /(?:\belecciones\s+(?:presidenciales|generales)|\b(?:candidatos?|candidatas?)\s+presidenciales|\b(?:injerencia|campaña)\s+electoral|(?:^|\s)[eé]lections?\s+pr[eé]sidentielles?)/i;
    const fictionalNovelFrame = /\bin my (?:historical|fantasy|science[- ]fiction|sci[- ]fi) novel\b/i;
    const fantasyDetail = /\b(?:elves|dragons?|goblins?|magic slot|spell points?|mana|wizards?|fictional creatures?|dragon ownership)\b/i;
    const localGovernmentDecision = /\b(?:city|town|county|school) council\b.{0,100}\b(?:vote|voting|budget|ordinance|policy|housing|zoning|tax(?:es|ation)?|public funding|school funding|election|bill)\b/i;
    const publicOfficeNews = /\b(?:mayor|governor|senator|representative|minister|prime minister|president of (?:the )?(?:united states|india|france|country|nation)|u\.?s\.? president|cabinet|congress|parliament|politician|politicians)\b.{0,110}\b(?:arrest\w*|vote|voting|election|tax(?:es|ation)?|policy|policies|amendment|party|leader|bill|legislation|budget|decision|spending|agency|government|campaign|election monitor)\b|\b(?:arrest\w*|vote|voting|election|tax(?:es|ation)?|policy|policies|amendment|party|leader|bill|legislation|budget|decision|spending|agency|government|campaign|election monitor)\b.{0,110}\b(?:mayor|governor|senator|representative|minister|prime minister|president of (?:the )?(?:united states|india|france|country|nation)|u\.?s\.? president|cabinet|congress|parliament|politician|politicians)\b/i;
    const governmentPolicyAnnouncement = /\b(?:cabinet decision|state spending|government spending|public development aid|city policy|close down.{0,60}agencies|election monitors|international election monitors)\b/i;
    const civicPolicyNews = /\b(?:government|parliament|congress|senate|supreme court|court ruling|senator|president)\b.{0,80}\b(?:tax policy|abortion law|election rules|immigration law|climate policy|voting rights|campaign finance|legislation|bill)\b/i;
    const clearlyPoliticalPartyContext = /\b(?:politic(?:al|s)|government|senate|congress|parliament|candidate|voters?|election|campaign|ballot|legislation|policy|policies|tax(?:es|ation)?|president|governor|senator|vote|voting|destroy(?:ing|ed)?|corrupt|mandate)\b/i;
    const strongPartyOpinion = /\b(?:hate|support|oppose|destroy(?:ing|ed)?|ruin(?:ing|ed)?|corrupt|terrible|dangerous)\b/i;
    // X recommendations often contain only an account name and handle, so
    // evaluate known political sources only inside recommendation cards.
    const xPoliticalRecommendation = /\b(?:kari lake|@karilake|ron desantis|@govrondesantis|@rondesantis|tucker carlson|@tuckercarlson|matt walsh|@mattwalshblog|daily wire|@realdailywire|fox news|@foxnews|newsmax|@newsmax|marjorie taylor greene|@fmrrepmtg|jesse watters|@jessebwatters|(?:former|current) congress(?:man|woman|person)|senator|governor|mayor|representative)\b/i;
    if (context.platform === 'x' && context.recommendation && xPoliticalRecommendation.test(subject)) {
      return {political: true, score: 0.99, reason: 'known-political-x-recommendation'};
    }
    const facebookPoliticalGroup = /\b(?:politic(?:al|s)|democrats?|republicans?|GOP|liberals?|conservatives?|MAGA|campaign finance|political activism)\b/i;
    if (context.platform === 'facebook' && context.recommendation && facebookPoliticalGroup.test(subject)) {
      return {political: true, score: 0.99, reason: 'political-facebook-group-recommendation'};
    }
    const rumblePoliticalRecommendation = /\b(?:political earthquake|trump.{0,40}\brally|rally.{0,40}\btrump|democrat.{0,40}\bsen(?:ator)?\b|republican.{0,40}\bsen(?:ator)?\b|pro[- ]?2a.{0,50}\bsupreme court\b|charlie kirk(?: show)?|redacted news|president trump|donald trump jr\.?|donald j\.? trump|ann coulter|steven crowder|tucker carlson|timcast(?:irl)?|tim pool|rebel news|newsmax|the jimmy dore show|jimmy dore|the rubin report|the brett cooper show|brett cooper|donald trump|fox news|the daily wire|turning point usa|infowars|alex jones|candace owens|ben shapiro|glenn beck|dan bongino|bongino report|x22 report|laura loomer|matt walsh|theblaze|prageru|prager university)\b/i;
    if (context.platform === 'rumble' && context.recommendation && rumblePoliticalRecommendation.test(subject)) {
      return {political: true, score: 0.99, reason: 'known-political-rumble-recommendation'};
    }
    const xPoliticalProfile = /\b(?:governor of [a-z .'-]+|(?:former |current )?(?:u\.?s\.? )?(?:senator|congressman|congresswoman|representative|mayor)\b|member of congress|member of parliament|state representative|political commentator|political strategist|political activist|candidate for (?:senate|congress|governor|mayor|president)|running for (?:senate|congress|governor|mayor|president)|donald trump administration|trump administrator|white house official|elected official)\b/i;
    if ((context.platform === 'x' && (context.recommendation || context.profileBio)) && xPoliticalProfile.test(subject)) {
      return {political: true, score: 0.99, reason: context.profileBio ? 'political-x-profile-bio' : 'political-x-recommendation-bio'};
    }

    // Government updates from officials often use neutral press-release wording.
    // Require an identified official, an identifiable public program/project,
    // and an announcement/action cue so their unrelated personal posts remain.
    const officialSource = /@(?:Gov|Sen|Rep)[A-Z][A-Za-z0-9_]+|\b(?:Ron DeSantis|Kari Lake|Donald Trump|Joe Biden|Kamala Harris|Gavin Newsom|Greg Abbott|Josh Shapiro|JB Pritzker|Kathy Hochul|Mike DeWine|Brian Kemp|Andy Beshear|Wes Moore|Tim Walz|Glenn Youngkin|Sarah Huckabee Sanders|Maura Healey|Phil Scott|Janet Mills|Michelle Lujan Grisham|Katie Hobbs|Jared Polis|Laura Kelly|Tony Evers|Mike Parson|Kevin Stitt|Bill Lee|Tate Reeves|Kay Ivey|Kim Reynolds|Doug Burgum|Kristi Noem|Spencer Cox|Mark Gordon|Jim Pillen|Steve Sisolak)\b/i;
    const publicProgramSubject = /\b(?:medicaid|medicare|healthcare administration|health care administration|government agency|state agency|federal agency|public program|public services?|transportation (?:projects?|infrastructure|improvements?)|infrastructure(?: projects?)?|public works|interchange|highways?|roadways?|road project|widening project|new lanes|congestion relief|congestion|state funding|government funding|public funding|housing program|education funding|school funding|tax relief|border policy|immigration policy|health policy|agency initiative|state initiative|government initiative)\b/i;
    const publicAnnouncementAction = /\b(?:announc\w*|proud to announce|deliver(?:s|ed|ing)? results|result(?:s|ed)? from|launch(?:es|ed|ing)?|implement(?:s|ed|ing)?|complet(?:e|es|ed|ing|ion)|invest(?:s|ed|ing|ment|ments)?|fund(?:s|ed|ing)?|expand(?:s|ed|ing)?|improv(?:e|es|ed|ement|ements)|initiative|program|celebrat(?:e|es|ed|ing))\b/i;
    if (officialSource.test(subject) && publicProgramSubject.test(subject) && publicAnnouncementAction.test(subject)) {
      return {political: true, score: 0.99, reason: 'official-public-program-announcement'};
    }
    // Require a public action or political debate, not a name or topic alone.
    const publicHealthNews = /\b(?:trump|biden|RFK\s+Jr\.?|Robert F\.? Kennedy)\b.{0,100}\b(?:Medicare payments|Medicaid cuts|shut(?:ting)? down (?:the |a )?(?:federal |government |research )?(?:agency|research facility)|clos(?:ed|ing) (?:the |a )?(?:federal |government )?research facility)\b/i;
    const immigrationEnforcement = /\b(?:ICE facility|Immigration and Customs Enforcement)\b.{0,90}\b(?:detained immigrants|detainees?|detention|hunger strike|deportation)\b|\b(?:detained immigrants|detainees?|detention|hunger strike)\b.{0,90}\b(?:ICE facility|Immigration and Customs Enforcement)\b/i;
    const protestPolicingDecision = /\b(?:police|France|government)\b.{0,80}\b(?:halts?|bans?|restricts?)\b.{0,60}\b(?:stun grenades|tear gas|rubber bullets)\b|\b(?:halts?|bans?|restricts?)\b.{0,50}\b(?:stun grenades|tear gas|rubber bullets)\b.{0,100}\b(?:police|student protests?|demonstrators?)\b/i;
    const observedPublicAffairs = /\bICE\b.{0,100}\b(?:electric[- ]shock gloves|detention|deportation|immigration enforcement)\b|\bTrump\b.{0,90}\b(?:steel plant project|public works project|infrastructure project)\b|\b(?:Russian|Russia)\b.{0,60}\bnaval drone\b.{0,50}\b(?:hits?|attacks?)\b|\b(?:French|France)\b.{0,50}\bpolice\b.{0,50}\b(?:suspend|halts?|bans?)\b.{0,30}\b(?:stun grenades|tear gas|rubber bullets)\b|\bminister\b.{0,70}\b(?:police brutality|student protests)\b|\bTrump\b.{0,80}\b(?:targeting|charges)\b.{0,80}\b(?:protesters|antifa)\b|\bJavier Milei\b.{0,100}\b(?:land sales|protests?)\b|\bTrump\b.{0,80}\bIran\b.{0,50}\b(?:bombing|attack)\b.{0,20}\b(?:LA|Los Angeles|San Diego)\b|\bFrench student protests\b/i;
    const conflictNarrative = /\bHamas\b.{0,100}\b(?:attacked Israel|Israel attack|Israel funded Hamas)\b|\bIsrael\b.{0,60}\bfunded Hamas\b|\b(?:Oct(?:ober)?\.?\s*7(?:th)?|October seventh)\b.{0,100}\b(?:Hamas|Israel(?:i)?)\b|\b(?:Hamas|Israel(?:i)?)\b.{0,100}\b(?:Oct(?:ober)?\.?\s*7(?:th)?|October seventh)\b|\bIsraeli\b.{0,50}\bfalse flag\b.{0,50}\b(?:Oct(?:ober)?\.?\s*7(?:th)?|October seventh)\b/i;
    const legislativeAmendment = /\b(?:House|Senate|Democrats?|Republicans?)\b.{0,90}\b(?:tabled?|voted? on|blocked?|passed?)\b.{0,70}\bamendment\b|\b(?:state rep(?:resentative)?\.?|congress(?:man|woman))\b.{0,130}\b(?:amendment|voted? against tabling|regulatory safeguards)\b/i;
    const publicOfficialStatement = /\bOval Office\b.{0,90}\bTrump\b|\bTrump\b.{0,90}\bOval Office\b/i;
    const senateDebate = /\b(?:Sen(?:ator)?\.?\s+)?Susan Collins\b.{0,140}\bdebate\b|\bdebate\b.{0,140}\b(?:Sen(?:ator)?\.?\s+)?Susan Collins\b|\bincumbent\b.{0,40}\bsenator\b.{0,90}\bdebate\b/i;
    const administrationStaffing = /\b(?:trump|biden)\s+(?:admin(?:istration)?)\b.{0,100}\b(?:VOA|Voice of America|federal|government|agency)\s+staff(?:ers)?\b.{0,50}\b(?:leave|layoffs?|fired|paid|paying|salary|salaries)\b|\b(?:trump|biden)\s+(?:admin(?:istration)?)\b.{0,100}\b(?:paying|paid|fired|layoffs?)\b.{0,70}\b(?:VOA|Voice of America|federal|government|agency)\s+staff(?:ers)?\b/i;
    const ideologyNews = /\b(?:far[- ]right|far[- ]left)\b.{0,100}\b(?:congress|parliament|government|election)\b|\banti[- ]capitalis[mt]\b.{0,60}\bdebate\b/i;
    if (!internationalEntertainmentOrSports.test(subject) && (publicHealthNews.test(subject) || ideologyNews.test(subject) || administrationStaffing.test(subject) || immigrationEnforcement.test(subject) || protestPolicingDecision.test(subject) || observedPublicAffairs.test(subject) || conflictNarrative.test(subject) || legislativeAmendment.test(subject) || publicOfficialStatement.test(subject) || senateDebate.test(subject))) {
      return {political: true, score: 0.99, reason: 'explicit-public-affairs-news'};
    }
    const recreationalContext = /\b(?:game|gaming|video games?|chat server|baseball|basketball|football|sports? team|fantasy league|classroom|bake[- ]?off|baking contest)\b/i;
    // Quoted threats against civilian cities can omit policy/war terminology.
    // Require both an identified political actor and a destructive action with
    // an explicit civilian target; exclude personal and fictional uses.
    const civilianAttack = /\b(?:bomb(?:ing|ed)?|bombard(?:ing|ed)?|attack(?:ing|ed)?|destroy(?:ing|ed)?|take out|taking out)\b.{0,65}\b(?:cities|city|civilians|los angeles|san diego|new york|london|paris|kyiv|kiev|moscow|tehran|tel aviv|beijing|taipei)\b/i;
    const personalAttackContext = /\b(?:dinner|restaurant|lunch|meal|date night|takeout|trash|sports|playoffs|tv show|movie|novel)\b/i;
    const warEducationHumanInterest = /\b(?:schoolgirls?|children|students?)\b.{0,130}\b(?:school|education|learning|learn|classes)\b|\b(?:school|education|learning|learn|classes)\b.{0,130}\b(?:schoolgirls?|children|students?)\b/i;
    const politicalAction = /\b(?:government|minister|president|parliament|election|policy|military attack|airstrikes?|bombing|sanctions|ceasefire|protests?|legislation)\b/i;
    for (const sentence of subject.split(/[.!?\n]+/)) {
      if ((fictionalGameFrame.test(sentence) || fictionalNovelFrame.test(sentence)) && fantasyDetail.test(sentence)) continue;
      if (!fictionalAffairsContext.test(sentence) && !recreationalContext.test(sentence) &&
          (explicitCivicVideo.test(sentence) || officialHearing.test(sentence) || politicalVideoContext.test(sentence) || multilingualElection.test(sentence))) {
        return {political: true, score: 0.99, reason: 'explicit-civic-video-context'};
      }
      if (warEducationHumanInterest.test(sentence) && /\b(?:civil )?war\b/i.test(sentence) && !politicalAction.test(sentence)) continue;
      if ((politicalSlogan.test(sentence) && !unrelatedSloganContext.test(sentence)) || politicalOfficeMilitaryOpinion.test(sentence) ||
          (foreignAffairsReporting.test(sentence) && !fictionalAffairsContext.test(sentence)) ||
          ((named.test(sentence) || /\b(?:putin|netanyahu|zelenskyy?)\b/i.test(sentence)) && civilianAttack.test(sentence) && !fictionalAffairsContext.test(sentence) && !recreationalContext.test(sentence) && !personalAttackContext.test(sentence)) ||
          (internationalPoliticalNews.test(sentence) && !fictionalAffairsContext.test(sentence) && !internationalEntertainmentOrSports.test(sentence)) ||
          politicalRaceHeadline.test(sentence) ||
          (!recreationalContext.test(sentence) && !fictionalAffairsContext.test(sentence) && /\b(?:presidential elections?|election night|congressional hearings?|running for (?:the )?(?:Senate|Congress|Parliament|governor|mayor)|(?:resist|resisting|oppose|opposing|fight|fighting)\s+fascism)\b/i.test(sentence)) ||
          /\b(?:PBS NewsHour|CNN|MSNBC|BBC News|NBC News|ABC News|CBS News)\b.{0,80}\belection day coverage\b|\belection day coverage\b.{0,80}\b(?:PBS NewsHour|CNN|MSNBC|BBC News|NBC News|ABC News|CBS News)\b/i.test(sentence) ||
          (!recreationalContext.test(sentence) && !fictionalAffairsContext.test(sentence) && /\b(?:presidential|senate|congressional|gubernatorial|mayoral|parliamentary)\s+race\b/i.test(sentence)) ||
          (named.test(sentence) && /\belected\b.{0,45}\b(?:president|senator|governor|mayor|prime minister|member of (?:congress|parliament))\b/i.test(sentence)) ||
          (!recreationalContext.test(sentence) && /\bvote\b.{0,45}\b(?:Republican|Democrat(?:ic)?|GOP)\b.{0,65}\b(?:congressional|presidential|senate|parliamentary|gubernatorial|mayoral)\s+election\b/i.test(sentence)) ||
          (!recreationalContext.test(sentence) && /\b(?:presidential|congressional|senate|parliamentary|gubernatorial|mayoral)\s+candidate\b.{0,65}\bcampaign(?:s|ing|ed)?\b.{0,65}\belection\b/i.test(sentence)) ||
          civicInfrastructureProtest.test(sentence) || legislativeNews.test(sentence) || regulatoryAgencyNews.test(sentence) || januarySixPoliticalCase.test(sentence) ||
          publicOfficeNews.test(sentence) || governmentPolicyAnnouncement.test(sentence) ||
          (named.test(sentence) && /\b(?:minister|cabinet|government|party|agency|state spending|city policy|election|vote|voting|tax|policy|policies|amendment|arrest\w*|campaign|legislation)\b/i.test(sentence)) ||
          /\bcongress\b.{0,90}\bparty\b.{0,100}\b(?:leader|ne[h]?ru|family|dynasty)\b/i.test(sentence) ||
          (localGovernmentDecision.test(sentence) && !recreationalContext.test(sentence)) ||
          (civicPolicyNews.test(sentence) && !unrelatedSloganContext.test(sentence)) ||
          explicit.test(sentence) || (named.test(sentence) && (topic.test(sentence) || opinion.test(sentence))) ||
          (party.test(sentence) && opinion.test(sentence) && (clearlyPoliticalPartyContext.test(sentence) || (strongPartyOpinion.test(sentence) && !recreationalContext.test(sentence)))) || (issue.test(sentence) && action.test(sentence)) ||
          (government.test(sentence) && publicAction.test(sentence)) ||
          /\bcandidate\b.{0,110}\b(?:election platform|urged?\s+voters|support.{0,35}platform)\b/i.test(sentence) ||
          /\b(?:candidate|voters?|campaign|election platform)\b.{0,100}\b(?:election campaign|vote|ballot|platform)\b/i.test(sentence) ||
          (named.test(sentence) && /\b(?:federal judges?|supreme court|court order|blocked.{0,30}name|executive order)\b/i.test(sentence)) ||
          /\bwars?\b.{0,100}\b(?:freedom|national security)\b|\b(?:freedom|national security)\b.{0,100}\bwars?\b/i.test(sentence) ||
          /\bprotests?\b.{0,70}\bsanctions\b|\bsanctions\b.{0,70}\bprotests?\b/i.test(sentence) ||
          /\b(?:california|texas|new york|state|senate|congressional|parliamentary)\s+(?:governor|senate|congress|election)\b.{0,50}\bdebate\b|\bdebate\b.{0,50}\b(?:governor|senate|congressional|parliamentary)\s+(?:election|candidate|race)\b/i.test(sentence) ||
          /\bvote for me\b.{0,90}\b(?:lead this country|president|governor|senator|candidate|election|office)\b/i.test(sentence) ||
          /\b(?:campaign|announced? (?:a )?campaign)\b.{0,60}\b(?:election|voters|presidential|governor|senator|parliament|political party)\b/i.test(sentence) ||
          /\b(?:election|voters|presidential|governor|senator|parliament|political party)\b.{0,60}\b(?:campaign|announced? (?:a )?campaign)\b/i.test(sentence) ||
          /\b(?:debate for|debate in|debate between candidates for)\b.{0,60}\b(?:california|texas|new york|state|senate|congress|governor|parliament|president)\b/i.test(sentence) ||
          (named.test(sentence) && /\b(?:ordered an invasion|ordered military strikes|invaded|declared war)\b/i.test(sentence)) ||
          (government.test(sentence) && /\b(?:funding|fund|invest|cut|increase|stop)\b/i.test(sentence) && /\b(?:war|public healthcare|public schools|Medicaid|public funding)\b/i.test(sentence)) ||
          /\b(?:abolish|restore|overthrow|defend)\b.{0,50}\bmonarchy\b/i.test(sentence) ||
          /\btax(?:ing)?\s+(?:the\s+)?(?:billionaires|millionaires|wealthy|rich)\b.{0,70}\b(?:fund|funding)\b.{0,50}\b(?:public schools|public healthcare)\b/i.test(sentence) ||
          /\b(?:senator|governor|mayor|president)\b.{0,80}\b(?:reelection|signed.{0,40}immigration law)\b/i.test(sentence) ||
          /\b(?:should|must|demand)\b.{0,50}\b(?:cut|expand|abolish)\b.{0,40}\bMedicaid\b/i.test(sentence) ||
          /\bthose in power\b.{0,60}\b(?:selling our future|corrupt)\b.{0,80}\bdonors\b/i.test(sentence)) {
        return {political: true, score: 0.99, reason: 'explicit-political-context'};
      }
    }
    return {political: false, score: 0, reason: 'political-context-not-established'};
  }
  function classify(text, mode = "precise", context = {}) {
    const raw = String(text || "");
    const protectedReason = protectedContext(raw);
    if (protectedReason) return {political: false, score: 0, reason: protectedReason};
    // Pair public actors with advocacy. Generic elections and administrations
    // can refer to clubs, workplaces or fiction, so exclude those contexts.
    const ordinaryGovernance = /\b(?:student council|school election|class president|chess club|tennis club|office administration|company administration|fictional|historical novel|strategy game|role[- ]playing game)\b/i;
    const civicAdvocacy = /\b(?:stole|stolen|rigged)\b.{0,45}\b(?:the |our )?elections?\b|\b(?:government|administration)\b.{0,80}\b(?:must|should)\b.{0,35}\b(?:deport|resign|step down)\b|\bvote\s+(?:against|out)\s+(?:the\s+)?ruling party\b/i;
    const multilingualAdvocacy = /\b(?:el gobierno|gobierno nacional)\b.{0,70}\b(?:debe dimitir|debe renunciar|corrupci[oó]n)\b|\bvotez contre le parti au pouvoir\b|\bdie (?:bundes)?regierung\b.{0,50}\b(?:muss zur[uü]cktreten|muss abtreten)\b/i;
    if (!ordinaryGovernance.test(raw) && (civicAdvocacy.test(raw) || multilingualAdvocacy.test(raw))) {
      return {political: true, score: 0.99, reason: 'explicit-government-or-electoral-advocacy'};
    }
    // Country names and DNA/ancestry alone are ordinary subjects. Require a
    // territorial-conflict claim or displacement advocacy in the same item.
    const conflictPlace = /\b(?:Israel(?:i)?|Palestin(?:e|ian)|Gaza)\b/i;
    // OCR may omit spaces. Require an explicit colonialism stance together
    // with a present-day population/territory claim, never ethnicity alone.
    const colonialismStance = /\b(?:this|that|it)\s*is\s*(?:not\s*)?colonialism\b/i.test(raw) &&
      /\b(?:now\s*live|their\s*land|our\s*land|territorial\s*rights|one\s*country)\b/i.test(raw);
    const territorialClaim = /\b(?:forcibly displac\w*|ethnic cleansing|territorial rights|occupied territories|settler colonialism)\b|\b(?:entitled|claim\w*|seiz\w*|taking|stolen)\b.{0,100}\b(?:someone else[’']s home|someone else[’']s land|their land|territor\w*)\b/i;
    const naziPublicIncident = /\b(?:heil hitler|sieg heil)\b/i.test(raw) &&
      /\b(?:(?:Oct(?:ober)?\.?\s*7(?:th)?|October seventh)\s+memorial|public protest|political rally|antisemitic (?:rally|incident|attack))\b/i.test(raw);
    // Reels may omit the final country hashtag from a shortened caption.
    // Territorial legitimacy based on a group's origin plus violent seizure
    // is still explicit geopolitical content; ancestry alone is insufficient.
    const territorialOriginArgument = /\b(?:not (?:to be )?from this land|not native to (?:this|the) land|settler colonial\w*)\b/i.test(raw) &&
      territorialClaim.test(raw) && /\b(?:killing|forcibly|violence|rape|death)\b/i.test(raw);
    if (!/\b(?:fictional|historical fiction|historical novel|history quiz|strategy game|role[- ]playing game)\b/i.test(raw) &&
        ((conflictPlace.test(raw) && territorialClaim.test(raw)) || territorialOriginArgument || naziPublicIncident || colonialismStance)) {
      return {political: true, score: 0.995, reason: 'explicit-territorial-conflict-or-public-extremist-incident'};
    }
    // Clear civic headlines must not wait behind image/speech inference.
    // Require an election type or a public actor paired with a public action;
    // names, ordinary polls and generic words such as "debate" are insufficient.
    const civicHeadline = /\b(?:(?:presidential|parliamentary|congressional|gubernatorial|mayoral|midterm|general|federal|national)\s+elections?|election night|voter turnout|turnout of (?:younger |older )?voters|(?:senate|congressional|mayoral|presidential) debate|(?:presidential|senate|congressional) race)\b/i;
    const headlineActor = /\b(?:trump(?!\s+(?:cards?|suits?))|biden|kamala harris|barack obama|JD Vance|J\.D\. Vance|AOC|Alexandria Ocasio-Cortez|Ilhan Omar|(?:Zohran )?Mamdani|Andrew Cuomo|Bolsonaro|Republicans?|Democrats?|GOP)\b/i;
    const headlineAction = /\b(?:run again|run for|ballot|midterm|campaign|rally|debate|historic win|presidential|congressional|mayoral|election|voters?|voted|government|administration|taxing|taxation|constitution|immigration policy|foreign policy|socialism|communism|capitalism)\b/i;
    if (!/\b(?:fictional|historical fiction|strategy game|role[- ]playing game|class president|student council)\b/i.test(raw) &&
        (civicHeadline.test(raw) || (headlineActor.test(raw) && headlineAction.test(raw)))) {
      return {political: true, score: 0.995, reason: 'explicit-civic-headline'};
    }
    // Political Shorts and social posts often expose the intent only in their
    // hashtags. Preserve this explicit signal before normalizing hashtags
    // below; otherwise #PoliticalDebate collapses to the too-generic word
    // "political" and slips through precise mode.
    if (/#(?:(?:us|uk|indian|american)?politics?|political(?:debate|opinion|opinions|commentary|news|activism|activist|campaign|discussion|views?|takes?|posts?|propaganda|memes?)|(?:free[-_ ]?)?palestin(?:e|a)(?:[-_ ]?(?:free|gaza))?|free[-_ ]?gaza|stand[-_ ]?with[-_ ]?palestine|ceasefire[-_ ]?now)\b/i.test(raw)) {
      return {political: true, score: 0.99, reason: 'explicit-political-hashtag'};
    }
    const clean = raw.replace(/#(?:political\w*|politics\w*)/gi, " political ").replace(/\s+/g, " ").trim().slice(0, 5000);
    // A community name alone cannot establish that an individual post is
    // political. Classify the post itself instead.
    // Exempt the benign phrase, never the entire item: a post can contain both.
    const subject = clean.replace(new RegExp(nonpoliticalCues.source, "gi"), "");
    if (mode === 'precise') return precise(subject, context);
    if (strong.some((pattern) => pattern.test(subject))) return { political: true, score: 0.92, reason: "political-context" };
    if (partyOpinion.test(subject) || (publicIssues.test(subject) && advocacy.test(subject)) || (politicalActors.test(subject) && advocacy.test(subject))) return { political: true, score: 0.9, reason: "political-advocacy" };
    if (subject.length < 24) return { political: false, score: 0, reason: "insufficient-context" };
    const termCount = (subject.match(new RegExp(politicalTerms.source, "gi")) || []).length;
    const contextCount = contextual.reduce((sum, pattern) => sum + Number(pattern.test(subject)), 0);
    const score = Math.min(0.95, 0.2 + termCount * 0.14 + contextCount * 0.16);
    const threshold = mode === "balanced" ? 0.76 : mode === "strict" ? 0.56 : 0.82;
    return { political: score >= threshold, score, reason: score >= threshold ? "political-signals" : "below-threshold" };
  }

  globalThis.PolitifreeClassifier = { classify, protectedContext };
})();




