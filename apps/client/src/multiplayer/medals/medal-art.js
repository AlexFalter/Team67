// Original BO3 textures converted from the community pack; see asset credits.
const medalImages={
 firstBlood:'/assets/medals/bloodthirsty-bo3.png',
 bicycleHit:'/assets/medals/roadrage-bo3.png',
 threePlayers:'/assets/medals/bloodthirsty-bo3.png',
 repeatOffender:'/assets/medals/revenge-bo3.png',
 bloodthirsty:'/assets/medals/bloodthirsty-bo3.png',
 revenge:'/assets/medals/revenge-bo3.png',
 publicMenace:'/assets/medals/roadrage-bo3.png',
 bagged:'/assets/medals/bankshot-bo3.png',
 bikeLaneJustice:'/assets/medals/retrieval-bo3.png',
 frankfurtDelivery:'/assets/medals/backstabber-bo3.png',
};
export function preloadMedalArt(){
 if(!globalThis.Image)return;
 for(const src of Object.values(medalImages)){const image=new Image();image.src=src;}
}
export function medalArt(icon,id){
 if(medalImages[id])return `<img src="${medalImages[id]}" alt="" width="128" height="128" draggable="false">`;
 const emblem=icon==='scope'?'<circle cx="100" cy="80" r="31" fill="none" stroke="url(#blade)" stroke-width="5"/><path d="M100 40V65M100 95V120M60 80H85M115 80H140" stroke="#eadcae" stroke-width="3"/><circle cx="100" cy="80" r="5" fill="#f5c66c"/>':icon==='bag'?'<path d="M77 65V57Q77 39 100 39Q123 39 123 57V65" fill="none" stroke="#eadcae" stroke-width="7"/><path d="M70 62H130L139 117H61Z" fill="url(#blade)" stroke="#faf0d6" stroke-width="2"/><path d="M86 79L100 102L114 79" fill="none" stroke="#384244" stroke-width="6"/>':icon==='wheel'?'<circle cx="100" cy="80" r="30" fill="none" stroke="url(#blade)" stroke-width="8"/><circle cx="100" cy="80" r="7" fill="#eddca8"/><path d="M100 50V110M70 80H130M79 59L121 101M79 101L121 59" stroke="#d7cb9e" stroke-width="3"/>':icon==='knife'?'<path d="M88 88L145 43Q150 72 129 89L105 105Z" fill="url(#blade)" stroke="#faf0d6" stroke-width="2"/><path d="M84 91L103 110M87 102L73 119Q69 125 76 131Q83 138 89 130L103 114" fill="none" stroke="#a39479" stroke-width="8"/><circle cx="80" cy="127" r="6" fill="#152027" stroke="#dfd2a7" stroke-width="3"/>':'<path d="M75 120L128 68M74 70L127 120" stroke="#b5aa87" stroke-width="9"/><path d="M72 74Q70 48 101 47Q132 48 130 74L123 94L114 97V110H87V97L79 94Z" fill="url(#blade)" stroke="#f1e6c8" stroke-width="2"/><path d="M80 73L95 77L92 88L80 85M106 77L122 73L121 85L109 88M97 87L103 87L106 95H94Z" fill="#192126"/><path d="M93 101V109M100 101V109M107 101V109" stroke="#4b493e" stroke-width="3"/>';
 return `<svg viewBox="0 0 200 170" aria-hidden="true"><defs><linearGradient id="metal"><stop stop-color="#eee8ce"/><stop offset=".35" stop-color="#8e8b7c"/><stop offset=".5" stop-color="#f1e4b1"/><stop offset="1" stop-color="#4c514e"/></linearGradient><linearGradient id="blade" x2="1" y2="1"><stop stop-color="#ffffec"/><stop offset=".5" stop-color="#969f99"/><stop offset="1" stop-color="#e8d7a3"/></linearGradient></defs><path d="M69 106L49 159L74 150L88 163L103 111M111 106L123 163L137 150L163 159L138 105" fill="#511d1c" stroke="#a27b54" stroke-width="2"/><path d="M82 44L36 57L49 73L18 80L39 94L23 104L72 117M118 44L164 57L151 73L182 80L161 94L177 104L128 117" fill="url(#metal)" stroke="#333a38" stroke-width="2"/><path d="M100 16L117 29L139 27L147 46L163 58L157 80L163 101L147 113L139 133L117 130L100 144L83 130L61 133L53 113L37 101L43 80L37 58L53 46L61 27L83 29Z" fill="url(#metal)" stroke="#e2d6a4" stroke-width="2"/><circle cx="100" cy="80" r="49" fill="#202b2d" stroke="#cab982" stroke-width="4"/><circle cx="100" cy="80" r="43" fill="#384244" stroke="#787c68"/>${emblem}</svg>`;
}
