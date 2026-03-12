import { defineConfig, presetAttributify, presetIcons, presetUno } from "unocss";

const sansStack = [
  "'Inter'",
  "system-ui",
  "-apple-system",
  "BlinkMacSystemFont",
  "'Segoe UI'",
  "Roboto",
  "sans-serif",
].join(", ");

const serifStack = [
  "'Ibarra Real Nova'",
  "Georgia",
  "'Times New Roman'",
  "serif",
].join(", ");

const monoStack = [
  "'JetBrains Mono'",
  "'Fira Code'",
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
          color: #37352f;
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
        border: "rgba(55, 53, 47, 0.12)",
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
      elegant: {
        paper: "#f7f6f3",
        subtle: "rgba(55, 53, 47, 0.05)",
        border: "rgba(55, 53, 47, 0.09)",
      }
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
    "notion-card": "bg-white border border-[rgba(55,53,47,0.12)] rounded-lg shadow-sm hover:shadow-md transition-shadow",
    "notion-card-inset": "bg-[#f7f6f3] border border-[rgba(55,53,47,0.09)] rounded-lg",
    "notion-input": "w-full rounded-md text-[16px] border border-[rgba(55,53,47,0.16)] bg-white px-3 py-2 text-[#37352f] placeholder-notion-secondary/50 outline-none transition-all focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500",
    "notion-btn-primary": "inline-flex items-center justify-center gap-2 bg-[#37352f] text-white px-5 py-2 rounded-md font-bold text-sm hover:bg-[#37352f]/90 transition-all active:scale-[0.98] disabled:opacity-50",
    "notion-btn-secondary": "inline-flex items-center justify-center gap-2 bg-white text-[#37352f] border border-[rgba(55,53,47,0.16)] px-5 py-2 rounded-md font-bold text-sm hover:bg-[#f7f6f3] transition-all active:scale-[0.98]",
    "notion-h1": "text-4xl sm:text-5xl font-bold tracking-tight text-[#37352f] mb-6 font-serif",
    "notion-p": "text-lg text-notion-secondary leading-relaxed mb-8 max-w-2xl font-sans",
    "notion-label": "text-[11px] font-black uppercase tracking-widest text-notion-secondary/60 mb-2 block",
    "notion-badge": "inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider border border-[rgba(55,53,47,0.08)]",
    "notion-callout": "p-5 rounded-lg border border-[rgba(55,53,47,0.09)] flex gap-4 bg-[#f7f6f3]/50",
  },
});
