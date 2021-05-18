import {spawn, exec} from 'child_process'

// export const echo = spawn('echo',['something']);

// const docker_fn = (args)=>{return exec('docker', args)}
const swarm_init_str = 'docker swarm init 2> /dev/null || true'
const d_net_create_str = 'docker network create --attachable --driver overlay "$project" 2> /dev/null || true'

export const swarm_init = ()=> exec(
                          swarm_init_str,
    ((e,r)=>(console.log(e,r))))

export const d_net_create = ()=>  exec(
                            d_net_create_str,
    ((e,r)=>console.log(e,r))
)
// swarm_init.stdout.on('data', (data)=>{
//     console.log("ee: " + data)
// })
// swarm_init.stderr.on('data', (data)=>{
//     console.log("stderr: " + data)
// })
// swarm_init.stdout.on('close', (code)=>{
//     console.log("process finished, code: " + code)
// })