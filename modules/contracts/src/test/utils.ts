import { waffle } from "@nomiclabs/buidler";
import { use } from "chai";
import { solidity } from "ethereum-waffle";
import subset from "chai-subset";

use(subset);
use(solidity);

export const expect = use(solidity).expect;

export const provider = waffle.provider;
