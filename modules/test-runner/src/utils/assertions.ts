import { use } from "chai";
import promised from "chai-as-promised";
import { waffleChai } from "@ethereum-waffle/chai";

use(promised);
use(waffleChai);

export { expect } from "chai";
