import { Wallet, utils, constants, providers } from "ethers";
import {env, fundIfBelow, getRandomIndex} from "../../utils";
import { EngineEvents, INodeService, TransferNames } from "@connext/vector-types";
import {RestServerNodeService} from "@connext/vector-utils";
import pino from "pino";
import {carolEvts} from "./setupServer";
import {
    chainId1, chainId2,
    deposit, provider2,
    setup,
    wallet1,
    wallet2,
} from "../../utils/channel";

import * as docker_api from './dockerNodeMgmt'
import {
    d_net_create,
    swarm_init,
    d_start_router,
    spawn_n_routers,
    start_messaging,
    test_process
} from "./dockerNodeMgmt";
const logger = pino({ level: env.logLevel });

//??is there a difference between doug and carol ?

const testName:string = 'Router Load Test'
const rogerURL:string = "http://localhost:8014"
const carolURL:string = "localhost??"


let routers:RestServerNodeService[] = [];
let nodes:RestServerNodeService[] = [];

async function setupRoger() {
    const routerIndex = getRandomIndex();
    //verify below
    // const routerIndex = 0;
    const events = undefined;

    const roger = await RestServerNodeService.connect(
        rogerURL,
        logger.child({testName, name:"roger"}),
        events,
        routerIndex
    )
    //fund roger
    // Default collateral is 0.1 ETH
    const provider2 = new providers.JsonRpcProvider("https://goerli.infura.io/v3/af2f28bdb95d40edb06226a46106f5f9");
    const w = Wallet.fromMnemonic('program biology gasp gentle describe boring suspect raven favorite uphold salon crater').connect(provider2);

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
// spawn_n_routers(1)

const start_stack = async()=>{
    const messaging = start_messaging.exec();
    const router_a = test_process.exec();
}


const r0Address = '0x36e6dEdC5554b2e1fedFb1627Be4D703f0da2B6D'
const r1Address = '0xE3E44bd168C03393d9Ef2E8B304686023E2ca233';
const daveAddress = '0xA383539Ae895Db1ABF4F6381eB082455366CF93c';
const carolAddress = '0x6D9B09e55e6341B019eB5CB05067d51cb058D788';

const g_provider = new providers.JsonRpcProvider("https://goerli.infura.io/v3/af2f28bdb95d40edb06226a46106f5f9");
const r_provider = new providers.JsonRpcProvider("https://rinkeby.infura.io/v3/af2f28bdb95d40edb06226a46106f5f9");

const getBalances = async function(provider){
    const addressesToCheck = [r0Address,r1Address,daveAddress,carolAddress];

    let allAddressesHaveETH = true;
    for(let i=0; i<addressesToCheck.length; i++) {
        const bal = await g_provider.getBalance(addressesToCheck[i])
        if (bal.toString() === "0")
        {
            //compare balance to 0
            allAddressesHaveETH = false;
        }
        console.log(bal.toString())
    }
    return allAddressesHaveETH;
}
const carolNodeURL = '8004'
const daveNodeURL = '8005'
const r0NodeUrl = '8002'
const r1Nodeurl = '8014'



const main = async function(){
    const participantsHaveETH = await getBalances(g_provider)

    if(!participantsHaveETH){return;}
    const urlBase = "http://localhost:"

    const index = 6969
    const daveService = await RestServerNodeService.connect(
        urlBase + daveNodeURL,
        logger.child({testName, name:"Dave"}),
        undefined,
        index)


    const carolService = await RestServerNodeService.connect(
        urlBase + carolNodeURL,
        logger.child({testName, name:"Carol"}),
        undefined,
        index)


    const r0Service = await RestServerNodeService.connect(
        urlBase + r0NodeUrl,
        logger.child({ testName, name: "Roger" }),
        undefined,
        0,
    );

    // const net = await g_provider.getNetwork()
    // const chainId = net.chainId;

    const cr0Post = await setup(carolService, r0Service, 5)

    console.log("C=>R0 Setup: ", cr0Post)

}
// start_stack()

main()