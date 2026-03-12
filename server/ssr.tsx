import type { ViteDevServer } from "vite";
import { readFile } from "node:fs/promises";
import { renderToString } from "react-dom/server";
import App from "../src/App";

const ROOT_MARKUP = /<div id="root"><\/div>/;
const DEV_TEMPLATE_PATH = `${process.cwd()}/index.html`;
const PROD_TEMPLATE_PATH = `${process.cwd()}/dist/frontend/index.html`;

type RenderAppPageOptions = {
  requestUrl: string;
  vite?: ViteDevServer;
};

async function loadTemplate(vite?: ViteDevServer) {
  if (vite) {
    return readFile(DEV_TEMPLATE_PATH, "utf8");
  }

  return readFile(PROD_TEMPLATE_PATH, "utf8");
}

export async function renderAppPage({ requestUrl, vite }: RenderAppPageOptions) {
  const template = await loadTemplate(vite);
  const appHtml = renderToString(<App />);
  const pathname = new URL(requestUrl).pathname;
  const html = template.replace(ROOT_MARKUP, `<div id="root">${appHtml}</div>`);

  if (vite) {
    return vite.transformIndexHtml(pathname, html);
  }

  return html;
}
