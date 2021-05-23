import {spawn, exec} from 'child_process'
import {docker_compose_configuration} from "./dockerNodeConfig";
const swarm_init_str = 'docker swarm init 2> /dev/null || true'
const d_net_create_str = 'docker network create --attachable --driver overlay "$project" 2> /dev/null || true'

const start_router = 'bash ops/start-router.sh'

export const swarm_init = ()=> exec(
                          swarm_init_str,
    ((e,r)=>(console.log(e,r))))

export const d_net_create = ()=>  exec(
                            d_net_create_str,
    ((e,r)=>console.log(e,r))
)


export const d_start_router = ()=>  exec(
    start_router,
    ((e,r)=>console.log(e,r))
)


export const spawn_router_start = spawn('bash',["ops/start-router.sh"], {shell:true})


export const  spawn_n_routers = (num_routers) => {
    // spawn('bash',["ops/start-router.sh"], {shell:true})
    spawn('docker',["stack", "deploy", "-c", docker_compose_configuration, "router"], {shell:true})

    for (let i = 0; i < num_routers; i++) {
        spawn_router_start.stdout.on('data', (data) => {
            console.log("Data from router node " + data)
        })
        spawn_router_start.stderr.on('data', (data) => {
            console.log("stderr: " + data)
        })
        spawn_router_start.stdout.on('close', (code) => {
            if (code)
                console.log("process finished, exit code " + code)
        })
    }
}