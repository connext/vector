import React, { useEffect } from "react";

import ConnextManager from "./ConnextManager";

function App() {
  const loadWasmLibs = async () => {
    const browser = await import("@connext/vector-browser-node");
    const utils = await import("@connext/vector-utils");
    new ConnextManager(browser, utils);
  };

  useEffect(() => {
    loadWasmLibs();
  }, []);

  return (
    <div className="App">
      <div className="Content"></div>
    </div>
  );
}

export default App;
