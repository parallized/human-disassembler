import { defineConfig, presetAttributify, presetIcons, presetUno } from "unocss";

export default defineConfig({
  presets: [
    presetUno(),
    presetAttributify(),
    presetIcons({
      scale: 1.2,
      cdn: 'https://esm.sh/'
    }),
  ],
  theme: {
    colors: {
      notion: {
        text: "#37352f",
        secondary: "rgba(55, 53, 47, 0.65)",
        border: "rgba(55, 53, 47, 0.16)",
        bg: "#ffffff",
        hover: "rgba(55, 53, 47, 0.08)",
        selection: "rgba(35, 131, 226, 0.28)",
        blue: "#2383e2",
      }
    }
  },
  content: {
    filesystem: ["src/**/*.{ts,tsx}", "server/**/*.{ts,tsx}"]
  },
  shortcuts: {
    'notion-card': 'bg-white border border-notion-border rounded-lg shadow-sm',
    'notion-input': 'w-full rounded-md text-[14px] border border-notion-border bg-transparent px-3 py-2 text-notion-text placeholder-notion-secondary outline-none transition-all focus:ring-2 focus:ring-notion-blue/20 focus:border-notion-blue',
    'notion-btn-primary': 'bg-notion-text text-white px-4 py-2 rounded-md font-medium hover:bg-notion-text/90 transition-all active:scale-[0.98]',
    'notion-btn-secondary': 'bg-white text-notion-text border border-notion-border px-4 py-2 rounded-md font-medium hover:bg-notion-hover transition-all active:scale-[0.98]',
  }
});
