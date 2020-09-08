import { use } from "chai";
import { solidity } from "ethereum-waffle";
import * as subset from "chai-subset";

use(subset);
use(solidity);

export const expect = use(solidity).expect;
