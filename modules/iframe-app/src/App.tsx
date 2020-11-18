import React from "react";

import ConnextManager from "./ConnextManager";

// eslint-disable-next-line
const connextManager = new ConnextManager();

class App extends React.Component {
  render() {
    return (
      <div className="App">
        <div className="Content">Test</div>
      </div>
    );
  }
}

export default App;
