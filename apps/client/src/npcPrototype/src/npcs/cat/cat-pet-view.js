// Flat, side-on petting surface. The back contour matches catPetEdge() exactly.
import {catPetEdge} from './cat-petting.js';
const edge=Array.from({length:41},(_,i)=>{const x=.32+.47*i/40;return `${i?'L':'M'}${x*1000} ${catPetEdge(x)*600}`;}).join(' ');
export const catPetView=`<svg viewBox="0 0 1000 600" xmlns="http://www.w3.org/2000/svg" aria-label="Cat lying on a bench. Trace the highlighted back with your hand.">
 <defs><linearGradient id="cat-fur" x2="0" y2="1"><stop stop-color="#e9dfcf"/><stop offset="1" stop-color="#d3c0a7"/></linearGradient><linearGradient id="cat-palm" x2="0" y2="1"><stop stop-color="#d5a589"/><stop offset="1" stop-color="#ac755e"/></linearGradient></defs>
 <rect width="1000" height="600" rx="20" fill="#e8e4da"/>
 <path d="M0 415H1000" stroke="#c7c7b7" stroke-width="2"/><ellipse cx="525" cy="404" rx="325" ry="23" fill="#28382a" opacity=".12"/>
 <path d="M126 410H879V449H126Z" fill="#956949"/><path d="M126 425H879" stroke="#744f36" stroke-width="3"/><path d="M210 449V545M794 449V545" stroke="#3d4941" stroke-width="18"/>
 <path d="M737 350C847 347 872 401 812 414C770 426 727 403 666 402" fill="none" stroke="#a96c40" stroke-width="35" stroke-linecap="round"/>
 <path d="M317 259 ${edge.replace(/^M[^L]+/,'')} C848 287 840 365 790 386C698 415 450 409 340 385L259 373Z" fill="url(#cat-fur)" stroke="#6a6056" stroke-width="3"/>
 <path d="M578 225C662 224 705 236 744 254C719 309 688 315 640 303C619 286 598 258 578 225Z" fill="#a56b40" opacity=".9"/>
 <path d="M460 243C489 272 501 302 488 333C447 349 393 330 379 298L392 253Z" fill="#514b43" opacity=".88"/>
 <path d="M215 230L210 164L263 205L306 190L335 145L342 239C372 279 354 327 320 347C272 375 212 347 191 310C177 280 187 248 215 230Z" fill="#ece0cb" stroke="#6a6056" stroke-width="3"/>
 <path d="M214 219L214 179L246 207Z M315 202L330 165L333 219Z" fill="#c38a79"/>
 <path d="M298 203L332 175L342 239C360 270 358 286 350 302L305 282Z" fill="#a96c40"/>
 <path d="M219 282Q235 295 251 282M282 276Q296 288 309 274" fill="none" stroke="#48473e" stroke-width="4" stroke-linecap="round"/>
 <path d="M260 307L271 303L281 308L271 316Z" fill="#ae7970"/><path d="M271 316V324M271 324Q257 334 249 324M271 324Q283 333 290 323" stroke="#716156" stroke-width="2" fill="none"/>
 <path d="M244 311L178 304M244 320L175 322M297 308L357 293M300 317L365 313" stroke="#fff7e9" stroke-width="2"/>
 <path d="M304 355C333 346 373 356 407 370C424 397 392 414 367 400L286 390C268 382 279 366 304 355Z M358 364C389 359 416 371 441 385C452 406 430 415 401 404L344 395" fill="#e9ddc7" stroke="#776b5e" stroke-width="2"/>
 <path class="cat-back-guide" d="${edge}" fill="none" stroke="#f6faf1" stroke-width="9" stroke-linecap="round"/><path d="${edge}" fill="none" stroke="#506c53" stroke-width="2" stroke-dasharray="6 9" opacity=".8"/>
 <circle class="cat-start-dot" cx="320" cy="${catPetEdge(.32)*600}" r="9" fill="#506c53"/><circle cx="790" cy="${catPetEdge(.79)*600}" r="6" fill="#506c53"/>
 <text x="510" y="110" text-anchor="middle" fill="#596052" font-family="Arial" font-size="15" letter-spacing="2">TRACE HER BACK ↔</text>
 <g class="cat-cursor-hand" transform="translate(320 258)" pointer-events="none">
  <ellipse cx="12" cy="8" rx="42" ry="13" fill="#333" opacity=".12"/>
  <g transform="rotate(-22)">
   <path d="M-28 109L-27 58C-37 46-38 31-43 18C-49 5-43-3-35 1L-18 21L-16-41C-16-53-4-55-2-43L0-8L3-57C4-69 18-70 19-56L20-7L26-49C28-61 41-57 40-45L38-1L46-33C50-44 62-38 58-26L52 30C50 47 35 57 33 70L31 109Z" fill="url(#cat-palm)" stroke="#875b4e" stroke-width="2"/>
   <path d="M-15 25C-2 20 16 24 27 34M-12 40C0 36 9 36 19 40M0-8L-1 8M20-7L19 9M38-1L36 11" fill="none" stroke="#a87560" stroke-width="1.5"/>
   <path d="M-30 88L35 88L39 153L-36 153Z" fill="#263e47"/><path d="M-30 88H35V101H-31Z" fill="#e7e7dc"/>
  </g>
 </g>
</svg>`;
