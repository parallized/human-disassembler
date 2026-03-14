import { defineConfig, presetIcons, presetUno } from "unocss";

const sansStack = [
  "'Nunito Variable'",
  "'寒蝉全圆体'",
  "'PingFang SC'",
  "'Hiragino Sans GB'",
  "'Microsoft YaHei'",
  "'Noto Sans SC'",
  "system-ui",
  "-apple-system",
  "BlinkMacSystemFont",
  "'Segoe UI'",
  "Roboto",
  "sans-serif",
].join(", ");

const monoStack = [
  "'JetBrains Mono'",
  "'Fira Code'",
  "monospace",
].join(", ");

export default defineConfig({
  presets: [
    presetUno(),
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
          background: #fbfbf9;
          color: #1a1a1a;
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
            transform: translateY(10px);
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
            transform: scale(1.02);
            opacity: 0.9;
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
        text: "#1a1a1a",
        secondary: "rgba(26, 26, 26, 0.6)",
        border: "rgba(26, 26, 26, 0.08)",
        bg: "#fbfbf9",
        hover: "rgba(26, 26, 26, 0.04)",
        selection: "rgba(0, 0, 0, 0.1)",
        blue: "#0066cc",
        green: "#2a7d4f",
        red: "#d93025",
        yellow: "#f9ab00",
        purple: "#7030a0",
        orange: "#e67e22",
        pink: "#d81b60",
        gray: "#5f6368",
      },
      elegant: {
        paper: "#fdfdfb",
        subtle: "rgba(0, 0, 0, 0.02)",
        border: "rgba(0, 0, 0, 0.06)",
        accent: "#1a1a1a",
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
    "notion-dot-bg": "bg-[radial-gradient(#e0e0e0_1.5px,transparent_1.5px)] [background-size:32px_32px]",
    "notion-card": "bg-white/60 border border-black/10 rounded-2xl shadow-2xl backdrop-blur-3xl transition-all duration-500",
    "notion-card-inset": "bg-black/[0.02] border border-black/5 rounded-2xl",
    "notion-input": "w-full rounded-xl text-[16px] border border-black/10 bg-white/50 px-4 py-3 text-[#1a1a1a] placeholder-black/30 outline-none transition-all duration-300 focus:bg-white focus:border-black/20 focus:shadow-[0_0_0_4px_rgba(0,0,0,0.03)]",
    "notion-btn-primary": "inline-flex items-center justify-center gap-2 bg-[#1a1a1a] text-white px-6 py-3 rounded-xl font-bold text-sm hover:bg-black/90 transition-all active:scale-[0.97] disabled:opacity-50 shadow-lg shadow-black/5",
    "notion-btn-secondary": "inline-flex items-center justify-center gap-2 bg-white text-[#1a1a1a] border border-black/40 px-6 py-3 rounded-lg text-sm hover:bg-[#fbfbf9] transition-all active:scale-[0.97] shadow-sm",
    "notion-h1": "text-5xl sm:text-7xl font-bold tracking-tight text-[#1a1a1a] mb-8 leading-[1.1]",
    "notion-p": "text-xl text-black/60 leading-relaxed mb-10 max-w-2xl font-sans",
    "notion-label": "text-[13px] font-bold uppercase tracking-[0.2em] text-black/40 mb-3 block",
    "notion-badge": "inline-flex items-center px-3 py-1 rounded-full text-[13px] font-bold uppercase tracking-wider border border-black/5 bg-black/[0.02]",
    "notion-callout": "p-6 rounded-2xl border border-black/5 flex gap-5 bg-black/[0.01] backdrop-blur-sm",
  },
});
