import { use } from "chai";
import promised from "chai-as-promised";
import subset from "chai-subset";
import { solidity } from "ethereum-waffle";

use(subset);
use(promised);
use(solidity);

export { expect } from "chai";
