import { Wallet, utils, constants } from "ethers";
import {env, fundIfBelow, getRandomIndex} from "../../utils";
import { EngineEvents, INodeService, TransferNames } from "@connext/vector-types";
import {RestServerNodeService} from "@connext/vector-utils";
import pino from "pino";
import {carolEvts} from "./setupServer";
import {
    chainId1,
    deposit,
    setup,
    wallet1,
    wallet2,
} from "../../utils/channel";

import * as docker_api from './dockerNodeMgmt'
import {d_net_create, swarm_init, d_start_router, spawn_n_routers} from "./dockerNodeMgmt";
const logger = pino({ level: env.logLevel });

//??is there a difference between doug and carol ?

const testName:string = 'Router Load Test'
const rogerURL:string = "localhost?"
const carolURL:string = "localhost??"


let routers:RestServerNodeService[] = [];
let nodes:RestServerNodeService[] = [];

async function setupRoger() {
    const routerIndex = getRandomIndex();
    //verify below
    // const routerIndex = 0;
    const events = undefined;
    const min = utils.parseEther("0.1");


    const roger = await RestServerNodeService.connect(
        rogerURL,
        logger.child({testName, name:"roger"}),
        events,
        routerIndex
    )
    //fund roger
    // Default collateral is 0.1 ETH
    await fundIfBelow(roger.signerAddress, constants.AddressZero, min.mul(15), wallet1);
    if (wallet2) {
        await fundIfBelow(roger.signerAddress, constants.AddressZero, min.mul(15), wallet2);
    }

    return roger
}
async function setupNode() {
    const routerIndex = getRandomIndex();
    //verify below
    // const routerIndex = 0;
    const events = undefined;
    const min = utils.parseEther("0.1");


    const roger = await RestServerNodeService.connect(
        rogerURL,
        logger.child({testName, name:"carol"}),
        carolEvts,
        routerIndex
    )
    //fund roger
    // Default collateral is 0.1 ETH
    await fundIfBelow(roger.signerAddress, constants.AddressZero, min.mul(15), wallet1);
    if (wallet2) {
        await fundIfBelow(roger.signerAddress, constants.AddressZero, min.mul(15), wallet2);
    }

    return roger
}
async function createRouters(num_routers:number){
    for(let i = 0; i <= num_routers; i++){
        const roger = await setupRoger()
        routers.push(roger);
    }
    return routers;
}
//non router nodes
async function createNode(num_nodes:number){
    for(let i = 0; i <= num_nodes; i++){
        const carol = await setupNode()
        nodes.push(carol);
    }
    return nodes;
}
//get two roters to setup together
const getRandomEntity = async function(entityArr:RestServerNodeService[], num_entities:number){
    const randEntities = entityArr.map(x => ({ x, r: Math.random() }))
        .sort((a, b) => a.r - b.r)
        .map(a => a.x)
        .slice(0, num_entities);
    return randEntities;
}
const setupChannelsBetweenNodesAndRouter = async function(nodes:RestServerNodeService[], router:RestServerNodeService) {
    const assetId = constants.AddressZero;
    const depositAmt = utils.parseEther("1");

    for (let i = 0; i < nodes.length; i++) {
        const setup_res = await setup(nodes[i], router[0], chainId1)
        await deposit(nodes[i], router[0], setup_res.channelAddress, assetId, depositAmt)
    }
}
async function start(){

    const transferAmt = utils.parseEther("0.1");

    const num_routers = 5;
    const num_nodes = 10;

    await createRouters(num_routers);

    await createNode(num_nodes);

    const randomRouter:RestServerNodeService = await getRandomEntity(routers,1)[0];
    const randomNodes:RestServerNodeService[] = await getRandomEntity(nodes, 3);

    const res = await setupChannelsBetweenNodesAndRouter(randomNodes, randomRouter)

    //setup channel between all carols and the random node
}

// d_net_create()
// swarm_init()
// d_start_router()
spawn_n_routers(3)