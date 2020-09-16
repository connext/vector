import { waffle } from "@nomiclabs/buidler";
import { use } from "chai";
import promised from "chai-as-promised";
import subset from "chai-subset";
import { solidity } from "ethereum-waffle";

use(promised);
use(solidity);
use(subset);

export const expect = use(solidity).expect;

export const provider = waffle.provider;
