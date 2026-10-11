import './phone-shell.css';
// Shared physical handset. Apps supply their own screen content and controls.
export function phoneShellMarkup(content,{home='<div class="photo-home"></div>'}={}){
 return `<div class="phone-speaker"></div><div class="phone-screen"><div class="phone-status"><span>ZH Mobile</span><time>09:41</time><span>▥ ▰</span></div>${content}</div>${home}`;
}
