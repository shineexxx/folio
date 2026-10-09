/** Base colors per palette; hover/selection/borders are derived in CSS. */
export interface Palette {
  bg: string;
  text: string;
  muted: string;
  faint: string;
  surface: string;
  accent: string;
  code: string;
  menu: string;
}

export const PALETTES: Record<string, { light: Palette; dark: Palette }> = {
  default: {
    light: { bg: "#ffffff", text: "#37352f", muted: "#787774", faint: "#9b9a97", surface: "#f7f6f3", accent: "#2383e2", code: "#eb5757", menu: "#ffffff" },
    dark: { bg: "#191919", text: "#e6e6e4", muted: "#9b9b9b", faint: "#6f6f6f", surface: "#202020", accent: "#529cca", code: "#ff7369", menu: "#252525" },
  },
  paper: {
    light: { bg: "#f8f4ea", text: "#3b3428", muted: "#7d7262", faint: "#a89d8a", surface: "#efe8d8", accent: "#b0652b", code: "#b0452b", menu: "#fbf8f0" },
    dark: { bg: "#1f1b16", text: "#e8dfcf", muted: "#a89c88", faint: "#6e6455", surface: "#2a251e", accent: "#d9925a", code: "#e8835a", menu: "#2a251e" },
  },
  graphite: {
    light: { bg: "#f5f5f4", text: "#1c1c1e", muted: "#6e6e73", faint: "#a1a1a6", surface: "#e9e9eb", accent: "#5e5ce6", code: "#d0365e", menu: "#ffffff" },
    dark: { bg: "#1c1c1e", text: "#f2f2f7", muted: "#98989d", faint: "#636366", surface: "#2c2c2e", accent: "#7d7aff", code: "#ff6482", menu: "#2c2c2e" },
  },
  nord: {
    light: { bg: "#eceff4", text: "#2e3440", muted: "#4c566a", faint: "#7b88a1", surface: "#e5e9f0", accent: "#5e81ac", code: "#bf616a", menu: "#f4f6f9" },
    dark: { bg: "#2e3440", text: "#eceff4", muted: "#a3acbd", faint: "#616e88", surface: "#3b4252", accent: "#88c0d0", code: "#d08770", menu: "#3b4252" },
  },
  solarized: {
    light: { bg: "#fdf6e3", text: "#586e75", muted: "#839496", faint: "#93a1a1", surface: "#eee8d5", accent: "#268bd2", code: "#dc322f", menu: "#fdf6e3" },
    dark: { bg: "#002b36", text: "#93a1a1", muted: "#839496", faint: "#586e75", surface: "#073642", accent: "#2aa198", code: "#cb4b16", menu: "#073642" },
  },
  rose: {
    light: { bg: "#fffafb", text: "#3d2b32", muted: "#8a6f78", faint: "#b9a2aa", surface: "#fbeff2", accent: "#d6336c", code: "#c2255c", menu: "#ffffff" },
    dark: { bg: "#1e1719", text: "#f1e4e8", muted: "#b49aa3", faint: "#6f5a61", surface: "#2a2023", accent: "#f06595", code: "#ff8fab", menu: "#2a2023" },
  },
  forest: {
    light: { bg: "#f6f8f4", text: "#26332a", muted: "#64735f", faint: "#98a693", surface: "#e9efe5", accent: "#2f8f5b", code: "#b5523b", menu: "#fbfcfa" },
    dark: { bg: "#161c18", text: "#dfe8dc", muted: "#97a693", faint: "#5d6b5a", surface: "#202822", accent: "#5cc28a", code: "#e58a6f", menu: "#202822" },
  },
};
