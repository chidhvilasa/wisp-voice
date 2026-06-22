import { useEffect, useState } from "react";
import App from "./App";
import Overlay from "./overlay/Overlay";

function getRoute(): string {
  return window.location.hash.replace(/^#/, "") || "/app";
}

export default function Router() {
  const [route, setRoute] = useState(getRoute());

  useEffect(() => {
    const onHashChange = () => setRoute(getRoute());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  if (route.startsWith("/overlay")) {
    return <Overlay />;
  }

  return <App />;
}
