"use client";
import dynamic from "next/dynamic";
const App = dynamic(() => import("./App").then((m) => m.App), { ssr: false });
export default function Client() {
  return <App />;
}
