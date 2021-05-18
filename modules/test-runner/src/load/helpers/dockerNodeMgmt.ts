import {spawn} from 'child_process'

// export const echo = spawn('echo',['something']);

const docker_fn = (args)=>{return spawn('docker', args)}


export const swarm_init = docker_fn(['swarm', 'init', '2>', '/dev/null'])

swarm_init.stdout.on('data', (data)=>{
    console.log("ee: " + data)
})
swarm_init.stderr.on('data', (data)=>{
    console.log("stderr: " + data)
})
swarm_init.stdout.on('close', (code)=>{
    console.log("process finished, code: " + code)
})