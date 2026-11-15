// Tema de la interfaz: "light", "dark" o nada (automático, según el sistema).
// Se guarda en localStorage y se aplica antes de pintar con el script de abajo, que va en el
// <head> del layout raíz: así no hay un destello del tema equivocado al cargar.
export const THEME_KEY = "rp-tema";
export const THEMES = ["auto", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;
