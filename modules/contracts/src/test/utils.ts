import { use } from "chai";
import { solidity } from "ethereum-waffle";

use(require("chai-subset"));
use(solidity);

export const expect = use(solidity).expect;
