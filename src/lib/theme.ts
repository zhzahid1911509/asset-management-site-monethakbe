export const THEME_KEY = "monethakbe-theme";
// Runs before body paint. Only a display preference is stored, never account data.
export const THEME_BOOTSTRAP = `(()=>{
 const key='monethakbe-theme', valid=v=>['light','dark','system'].includes(v);
 const media=window.matchMedia('(prefers-color-scheme: dark)');
 let preference='system';try{const stored=localStorage.getItem(key);if(valid(stored))preference=stored}catch{}
 const apply=()=>{const mode=preference==='system'?(media.matches?'dark':'light'):preference;document.documentElement.dataset.theme=mode;document.documentElement.dataset.themePreference=preference;document.documentElement.style.colorScheme=mode;document.dispatchEvent(new Event('monethakbe:theme-applied'))};
 document.addEventListener('monethakbe:theme',event=>{if(!valid(event.detail))return;preference=event.detail;try{localStorage.setItem(key,preference)}catch{}apply()});
 window.addEventListener('storage',event=>{if(event.key===key||event.key===null){preference=valid(event.newValue)?event.newValue:'system';apply()}});
 media.addEventListener('change',()=>{if(preference==='system')apply()});apply();
})();`;
