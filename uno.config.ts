import { defineConfig, presetAttributify, presetIcons, presetUno } from "unocss";

const sansStack = [
  "Inter",
  "system-ui",
  "-apple-system",
  "BlinkMacSystemFont",
  "'Segoe UI'",
  "Roboto",
  "Oxygen",
  "Ubuntu",
  "Cantarell",
  "'Noto Sans'",
  "'Helvetica Neue'",
  "'PingFang SC'",
  "'Hiragino Sans GB'",
  "'Microsoft YaHei'",
  "'Microsoft JhengHei'",
  "'Noto Sans CJK SC'",
  "'Noto Sans SC'",
  "'Source Han Sans SC'",
  "'WenQuanYi Micro Hei'",
  "sans-serif",
].join(", ");

const monoStack = [
  "'JetBrains Mono'",
  "'Fira Code'",
  "'Roboto Mono'",
  "'Source Code Pro'",
  "'SFMono-Regular'",
  "Consolas",
  "'Liberation Mono'",
  "'PingFang SC'",
  "'Microsoft YaHei'",
  "monospace",
].join(", ");

export default defineConfig({
  presets: [
    presetUno(),
    presetAttributify(),
    presetIcons({
      scale: 1.2,
      cdn: "https://esm.sh/",
    }),
  ],
  preflights: [
    {
      getCSS: () => `
        :root {
          font-family: ${sansStack};
        }

        *, *::before, *::after {
          box-sizing: border-box;
          font-family: inherit;
        }

        html, body {
          margin: 0;
          padding: 0;
          width: 100vw;
          max-width: 100vw;
          height: 100vh;
          height: 100dvh;
          max-height: 100dvh;
          overflow: hidden;
          font-family: ${sansStack};
          background: #ffffff;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          text-rendering: optimizeLegibility;
        }

        body, #root {
          width: 100%;
          min-height: 100vh;
          min-height: 100dvh;
          max-width: 100vw;
          overflow: hidden;
        }

        img, svg, canvas, video {
          display: block;
          max-width: 100%;
        }

        button, input, optgroup, select, textarea {
          font-family: inherit;
        }

        code, pre, kbd, samp {
          font-family: ${monoStack};
        }

        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(4px);
          }

          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes pulse-subtle {
          0%, 100% {
            transform: scale(1);
            opacity: 1;
          }

          50% {
            transform: scale(1.06);
            opacity: 0.82;
          }
        }
      `,
    },
  ],
  theme: {
    fontFamily: {
      sans: sansStack,
      mono: monoStack,
    },
    colors: {
      notion: {
        text: "#37352f",
        secondary: "rgba(55, 53, 47, 0.65)",
        border: "rgba(55, 53, 47, 0.25)",
        bg: "#ffffff",
        hover: "rgba(55, 53, 47, 0.08)",
        selection: "rgba(35, 131, 226, 0.28)",
        blue: "#2383e2",
        green: "#448361",
        red: "#eb5757",
        yellow: "#dfab01",
        purple: "#9065b0",
        orange: "#d9730d",
        pink: "#ad1a72",
        gray: "#787774",
      },
    },
    breakpoints: {
      sm: "640px",
      md: "768px",
      lg: "1024px",
      xl: "1280px",
    },
  },
  content: {
    filesystem: ["src/**/*.{ts,tsx}", "server/**/*.{ts,tsx}"],
  },
  shortcuts: {
    "notion-dot-bg": "bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:24px_24px]",
    "notion-card": "bg-white/92 border-2 border-notion-border rounded-lg shadow-lg shadow-notion-text/5",
    "notion-card-inset": "bg-notion-hover/10 border-2 border-notion-border/70 rounded-xl shadow-inner shadow-notion-text/5",
    "notion-input": "w-full rounded-md text-[16px] border-2 border-notion-border/80 bg-transparent px-3 py-2 text-notion-text placeholder-notion-secondary/50 outline-none transition-all focus:ring-4 focus:ring-notion-blue/10 focus:border-notion-blue",
    "notion-btn-primary": "inline-flex items-center justify-center gap-2 bg-notion-text text-white px-5 py-2.5 rounded-md font-bold text-sm hover:bg-notion-text/90 transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none",
    "notion-btn-secondary": "inline-flex items-center justify-center gap-2 bg-white text-notion-text border border-notion-border px-5 py-2.5 rounded-md font-bold text-sm hover:bg-notion-hover transition-all active:scale-[0.98] disabled:opacity-50",
    "notion-h1": "text-4xl sm:text-5xl font-extrabold tracking-tight text-notion-text mb-6 leading-[1.1]",
    "notion-p": "text-lg text-notion-secondary leading-relaxed mb-8 max-w-2xl",
    "notion-label": "text-xs font-black uppercase tracking-widest text-notion-secondary mb-2 block",
    "notion-badge": "inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider border",
    "notion-callout": "p-5 rounded-lg border border-notion-border flex gap-4",
  },
});
