import React, { useState, useEffect } from "react";

import ConnextManager from "./ConnextManager";

// eslint-disable-next-line
let connextManager;

function App() {
  const [browserNodePkg, setBrowserNodePkg] = useState<any>();
  const [utilsPkg, setUtilsPkg] = useState<any>();

  const loadWasmLibs = async () => {
    const browser = await import("@connext/vector-browser-node");
    setBrowserNodePkg(browser);
    const utils = await import("@connext/vector-utils");
    connextManager = new ConnextManager(browser, utils);
    setUtilsPkg(utils);
  };

  useEffect(() => {
    loadWasmLibs();
  }, []);

  return (
    <div className="App">
      <div className="Content">Testing</div>
    </div>
  );
}

// class App extends React.Component {
//   render() {
//     return (
//       <div className="App">
//         <div className="Content">Testing</div>
//       </div>
//     );
//   }
// }

export default App;
