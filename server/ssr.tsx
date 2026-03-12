import { renderToString } from "react-dom/server";
import App from "../src/App";

const ROOT_MARKUP = /<div id="root"><\/div>/;
const templatePath = `${process.cwd()}/dist/frontend/index.html`;

export async function renderAppPage() {
  const template = await Bun.file(templatePath).text();
  const appHtml = renderToString(<App />);

  return template.replace(ROOT_MARKUP, `<div id="root">${appHtml}</div>`);
}

