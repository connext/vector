import {
  getTestLoggers,
  mkPublicIdentifier,
  testStore,
} from "@connext/vector-utils";
import indexedDB from "fake-indexeddb";
import IDBKeyRange from "fake-indexeddb/lib/FDBKeyRange";

import { BrowserStore } from "./store";

const name = "BrowserStore";
const { log } = getTestLoggers(name);
const pubId = mkPublicIdentifier();

testStore(name, () => new BrowserStore(pubId, log, indexedDB, IDBKeyRange), true)
