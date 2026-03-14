import "@fontsource-variable/nunito";
import "@chinese-fonts/hcqyt/dist/ChillRoundFRegular/result.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/600.css";
import "virtual:uno.css";
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  type MetaFunction,
} from "react-router";

export const meta: MetaFunction = () => {
  return [
    { title: "AI, Remember Me" },
    {
      name: "description",
      content: "通过 100 个深度问题与 AI 协作，生成可复用的个人 HUMAN.md 档案。",
    },
  ];
};

export default function Root() {
  return (
    <html lang="zh-CN">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
