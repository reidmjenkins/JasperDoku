/* JasperDoku - Jasper's Journal: the pages, in his own words.
   Each scrap is found by placing Jasper on a hidden square on some levels.
   Text pages: one or two torn strips. Drawing pages: torn into a top half and a bottom half.
   Scrap ids are saved on the phone, so never rename an id once it has shipped. */
(function () {
  'use strict';
  const S = 'fill="none" stroke="#3b2c20" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"';
  const T = 'font-family="Segoe Print, Bradley Hand, Chalkboard SE, Marker Felt, cursive" fill="#7a5a3c"';
  const DRAW = {
    // Jasper creeping along the fence top, Leo zooming across the yard below
    ambush: '<svg viewBox="0 0 220 170" aria-hidden="true"><g ' + S + '>' +
      '<path d="M8 66h204v44H8z"/><path d="M28 66v44M48 66v44M68 66v44M88 66v44M108 66v44M128 66v44M148 66v44M168 66v44M188 66v44M208 66v44"/>' +
      '<path d="M16 76v8M38 90v10M57 74v6M77 92v9M96 80v8M118 96v8M137 84v10M157 96v7M177 78v9M198 88v10" stroke-width="1.2" opacity=".55"/>' +
      '<path d="M118 66c4-12 18-18 34-16s24 8 26 14"/><path d="M178 64c6-2 10-8 8-16"/><path d="M118 66c-6-4-8-12-4-18l4-10 6 8c4-1 8 0 10 2l6-8 2 12"/>' +
      '<circle cx="124" cy="52" r="1.6" fill="#3b2c20"/><circle cx="131" cy="53" r="1.6" fill="#3b2c20"/><path d="M128 58l-12-1M128 60l-11 3"/>' +
      '<path d="M40 150c6-12 18-18 34-17 14 1 22 6 28 12"/><path d="M102 142c10-2 14-14 6-20-6-3-10 4-5 8"/><path d="M40 150c-8-2-14-8-14-16l2-14 8 8 6-8 4 12"/>' +
      '<circle cx="34" cy="132" r="1.6" fill="#3b2c20"/><path d="M28 140q4 2 8 0"/><path d="M48 150l-4 12M64 152l2 10M84 150l-2 12M96 148l6 10"/>' +
      '<path d="M112 130h22M116 140h26M110 150h18" stroke-dasharray="4 5"/></g>' +
      '<text x="140" y="24" ' + T + ' font-size="15">me</text><path d="M148 28l-4 14" ' + S + '/>' +
      '<text x="112" y="166" ' + T + ' font-size="13" textLength="100" lengthAdjust="spacingAndGlyphs">Leo (fast) (loud)</text></svg>',
    // Jasper batting one of Leo's tennis balls while Leo naps
    borrowed: '<svg viewBox="0 0 220 170" aria-hidden="true"><g ' + S + '>' +
      '<path d="M16 72c2-18 14-28 30-28s28 10 30 26"/><path d="M28 50l-4-18 14 12M58 46l6-17-14 13"/><path d="M36 60q3 3 6 0M50 60q3 3 6 0"/><path d="M42 68q4 4 8 0"/>' +
      '<path d="M76 70c10 2 18 0 24-6"/><path d="M38 76l-4 14M56 76l2 14"/><path d="M60 84c18-6 30-6 42 0" />' +
      '<circle cx="128" cy="96" r="16"/><path d="M114 88c8 4 18 4 26-6M114 106c8-6 18-6 28 2" />' +
      '<path d="M104 82c8 2 12 8 10 14"/><path d="M102 78c-2 4 0 8 4 8"/>' +
      '<path d="M150 104l10 4M150 92l12-2M146 112l8 8" stroke-dasharray="3 4"/>' +
      '<path d="M120 150c8-10 24-14 44-12s30 6 38 12c-16 6-30 8-48 6-14-1-26-2-34-6z"/><path d="M128 146l-4-10 10 6M150 140l2-10 6 9"/><path d="M134 146q3 2 6 0M146 145q3 2 6 0"/></g>' +
      '<text x="170" y="124" ' + T + ' font-size="15">z</text><text x="182" y="112" ' + T + ' font-size="18">z</text><text x="196" y="98" ' + T + ' font-size="21">z</text>' +
      '<text x="20" y="160" ' + T + ' font-size="16">borrowed.</text><text x="20" y="22" ' + T + ' font-size="13">not stolen.</text></svg>',
    // a wobbly map of his night walks
    route: '<svg viewBox="0 0 220 170" aria-hidden="true"><g ' + S + '>' +
      '<g stroke-width="1.6" opacity=".7"><rect x="12" y="8" width="56" height="42" rx="4"/><rect x="82" y="8" width="56" height="42" rx="4"/><rect x="152" y="8" width="56" height="42" rx="4"/><rect x="12" y="62" width="56" height="42" rx="4"/><rect x="82" y="62" width="56" height="42" rx="4"/><rect x="152" y="62" width="56" height="42" rx="4"/><rect x="12" y="116" width="56" height="42" rx="4"/><rect x="82" y="116" width="56" height="42" rx="4"/><rect x="152" y="116" width="56" height="42" rx="4"/></g>' +
      '<path d="M26 150v-12l10-9 10 9v12zM33 150v-6h6v6"/>' +
      '<path d="M102 36c-8-1-11-10-5-15 1-8 13-9 17-3 8-1 12 6 8 12 1 6-6 9-11 6-3 3-7 3-9 0z"/><path d="M109 38v8"/><circle cx="110" cy="27" r="1.6"/>' +
      '<path d="M166 96v-14h20v14M162 84l14-10 14 10" stroke="#3d6fb0"/>' +
      '<path d="M74 58v6M74 58l4 2"/><circle cx="79" cy="61" r="2" fill="#e8b923" stroke="#c79a1a"/>' +
      '<path d="M52 146h23V56h70V27h36" stroke-dasharray="2 7" stroke-width="3"/>' +
      '<path d="M186 22l10 10M196 22l-10 10" stroke="#b33"/></g>' +
      '<text x="18" y="130" ' + T + ' font-size="11">home</text>' +
      '<text x="114" y="47" ' + T + ' font-size="10">owl</text>' +
      '<text x="156" y="103" ' + T + ' font-size="10" textLength="52" lengthAdjust="spacingAndGlyphs">blue house</text>' +
      '<text x="172" y="46" ' + T + ' font-size="12">???</text></svg>',
    // Jasper mid-leap after his blue string-on-a-stick toy with the little jellyfish
    string: '<svg viewBox="0 0 220 170" aria-hidden="true"><g ' + S + '>' +
      '<path d="M70 104c4-22 22-36 46-34 18 2 30 12 34 26"/><path d="M150 96c10 2 18-4 22-14"/><path d="M70 104c-8-4-12-12-10-20l2-14 10 9c4-1 9 0 12 2l7-9 2 13"/>' +
      '<circle cx="74" cy="84" r="1.8" fill="#3b2c20"/><circle cx="82" cy="86" r="1.8" fill="#3b2c20"/><path d="M76 92q3 3 6 0"/>' +
      '<path d="M86 106l-18 14M100 108l-8 22M132 104l12 18M144 100l20 10"/>' +
      '<path d="M214 4l-34 30" stroke="#8a5a32" stroke-width="4"/>' +
      '<path d="M180 34c-14 18-40 2-56 14s-14 26-34 18-20-24-28-32" stroke="#3f7fd0"/>' +
      '<g transform="translate(-6,-16)"><path d="M58 52a10 9 0 0 1 20 0z" fill="#cfe2f7" stroke="#3f7fd0"/><path d="M60 52q-2 6 1 12M65 52q2 7-1 13M71 52q-2 6 1 12M76 52q2 5 0 10" stroke="#3f7fd0" stroke-width="1.6"/><circle cx="64" cy="47" r="1.1" fill="#3b2c20" stroke="none"/><circle cx="71" cy="47" r="1.1" fill="#3b2c20" stroke="none"/></g>' +
      '<path d="M88 96l-6-22M96 98l2-20"/>' +
            '<path d="M52 140h30M112 146h40" stroke-dasharray="4 5"/></g>' +
      '<text x="112" y="166" ' + T + ' font-size="17" textLength="100" lengthAdjust="spacingAndGlyphs">I am winning</text></svg>',
  };
  // kind: 'text' (scraps are strips of writing) or 'draw' (scrap 1 = top half, scrap 2 = bottom half)
  const PAGES = [
    { id: 'hello', title: 'Hello', kind: 'text', scraps: [
      ['hello-1', 'This is my journal. Mom and Dad think I spend my nights doing nothing. They are sweet. They are also wrong.'],
      ['hello-2', 'I\'ll write it all down here, so one day they\'ll know where I go when the moon gets—'] ] },
    { id: 'leo', title: 'About Leo', kind: 'text', scraps: [
      ['leo-1', 'Leo was here first. I try to remember that when he stands over his bowl and stares at me like I\'m a burglar. I don\'t want his food. Mostly.'],
      ['leo-2', 'But tonight he slept with his back against mine, and his breathing went slow, and I thought: maybe this is how a dog says sorry.'] ] },
    { id: 'ambush', title: 'A drawing', kind: 'draw', draw: 'ambush', caption: 'he never sees it coming (he always sees it coming)', scraps: [['ambush-1'], ['ambush-2']] },
    { id: 'blinds', title: 'The Blinds', kind: 'text', scraps: [
      ['blinds-1', 'Someone closed the blinds again. I will never understand choosing to see less of the world.'],
      ['blinds-2', 'So I push them aside with my head, and there it is. The street, the birds, the whole night, waiting—'] ] },
    { id: 'walk1', title: 'Night Walk No. 1 · The Owl', kind: 'text', scraps: [
      ['walk1-1', 'Three houses down there\'s an oak with a hollow in it. The owl who lives there says he\'s older than the streetlights.'],
      ['walk1-2', 'He asked where I was going. I said "nowhere in particular." He said that\'s the best place to—'] ] },
    { id: 'pets', title: 'Pets', kind: 'text', scraps: [
      ['pets-1', 'Pat pat pat, right above the tail. Yes. That. Perfect. Keep going— okay, that\'s enough. Now I have to bite you a little. It\'s not personal. It\'s love with teeth.'] ] },
    { id: 'borrowed', title: 'A drawing', kind: 'draw', draw: 'borrowed', caption: 'Leo\'s ball. Leo\'s nap. My turn.', scraps: [['borrowed-1'], ['borrowed-2']] },
    { id: 'walk2', title: 'Night Walk No. 2 · The Rain', kind: 'text', scraps: [
      ['walk2-1', 'It rained tonight. The other cats ran under porches. I didn\'t. Rain is only the sky giving you a bath.'],
      ['walk2-2', 'But by the third street my fur was heavy, and all I could think of was the sofa, and Mom\'s lap, and Dad\'s—'] ] },
    { id: 'zoomies', title: 'Zoomies', kind: 'text', scraps: [
      ['zoomies-1', 'Around 2 a.m. something comes over me. I don\'t know what it is, but my legs do. Up the stairs, down the stairs, across the bed, over Leo (sorry Leo), up the—'] ] },
    { id: 'walk3', title: 'Night Walk No. 3 · The Moon Meeting', kind: 'text', scraps: [
      ['walk3-1', 'On full moons, the neighborhood cats meet on the roof of the blue house. We don\'t do much. We sit in a circle and look at the moon. A tabby named Biscuit takes attendance.'],
      ['walk3-2', 'They asked what I\'d do if I could do anything. I said I already have it: a mom, a dad, a warm bed, and a brother who\'s—'] ] },
    { id: 'uphigh', title: 'Up High', kind: 'text', scraps: [
      ['uphigh-1', 'Behind Dad\'s desk there\'s a bed that floats. From up there I watch him work, which mostly means typing and sighing. I\'m helping.'] ] },
    { id: 'route', title: 'A drawing', kind: 'draw', draw: 'route', caption: 'my route (don\'t show Leo)', scraps: [['route-1'], ['route-2']] },
    { id: 'walk4', title: 'Night Walk No. 4 · The Fox', kind: 'text', scraps: [
      ['walk4-1', 'I met a fox under the streetlight at the end of the block. She asked if I was lost.'],
      ['walk4-2', 'I told her I\'ve never been lost. I just haven\'t been home yet.'] ] },
    { id: 'mom', title: 'Mom', kind: 'text', scraps: [
      ['mom-1', 'When Mom picks me up I go soft all over, like warm bread. I don\'t decide to. It just happens.'] ] },
    { id: 'leo2', title: 'Leo, Again', kind: 'text', scraps: [
      ['leo2-1', 'Sometimes I think Leo\'s afraid I\'ll take something from him. I want to tell him I don\'t need his food, or his spot, or his tennis balls. I just want a brother.'],
      ['leo2-2', '(I do need his tennis balls occasionally.)'] ] },
    { id: 'string', title: 'A drawing', kind: 'draw', draw: 'string', caption: 'the string and I are in a disagreement', scraps: [['string-1'], ['string-2']] },
    // the last page: always the final scrap found
    { id: 'walk5', title: 'Night Walk No. 5 · Where I Go', kind: 'text', finale: true, scraps: [
      ['walk5-1', 'You always wonder where I go at night. Here\'s the truth.'],
      ['walk5-2', 'I go out to see how big the world is. And every night I learn it\'s exactly as big as the walk home to you.'] ] },
  ];
  window.JASPER_JOURNAL = { PAGES, DRAW, FIRST: 'hello-1' };
})();
