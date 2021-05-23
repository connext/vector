const router_server_config = {
    internal_port:"9002",
    public_port:"9002",
    public_url:`http://127.0.0.1:9002/ping`,

}
export const node_config_json =
    {
        "adminToken": "cxt1234",
        "chainAddresses": {
            "1337": {
                "channelFactoryAddress": "0x345cA3e014Aaf5dcA488057592ee47305D9B3e10",
                "testTokenAddress": "0x8CdaF0CD259887258Bc13a92C0a6dA92698644C0",
                "transferRegistryAddress": "0x9FBDa871d559710256a2502A2517b794B482Db40"
            },
            "1338": {
                "channelFactoryAddress": "0x345cA3e014Aaf5dcA488057592ee47305D9B3e10",
                "testTokenAddress": "0x8CdaF0CD259887258Bc13a92C0a6dA92698644C0",
                "transferRegistryAddress": "0x9FBDa871d559710256a2502A2517b794B482Db40"
            }
        },
        "chainProviders": {
            "1337": "http://evm_1337:8545",
            "1338": "http://evm_1338:8545"
        },
        "logLevel": "info",
        "messagingUrl": "",
        "production": false
}

export const router_config = {
    "allowedSwaps": [
        {
            "fromChainId": 1337,
            "toChainId": 1338,
            "fromAssetId": "0x0000000000000000000000000000000000000000",
            "toAssetId": "0x0000000000000000000000000000000000000000",
            "priceType": "hardcoded",
            "hardcodedRate": "1"
        },
        {
            "fromChainId": 1337,
            "toChainId": 1338,
            "fromAssetId": "0x8CdaF0CD259887258Bc13a92C0a6dA92698644C0",
            "toAssetId": "0x8CdaF0CD259887258Bc13a92C0a6dA92698644C0",
            "priceType": "hardcoded",
            "hardcodedRate": "1"
        }
    ],
    "messagingUrl": "",
    "production": false,
    "rebalanceProfiles": [
        {
            "chainId": 1337,
            "assetId": "0x0000000000000000000000000000000000000000",
            "reclaimThreshold": "200000000000000000",
            "target": "100000000000000000",
            "collateralizeThreshold": "50000000000000000"
        },
        {
            "chainId": 1338,
            "assetId": "0x0000000000000000000000000000000000000000",
            "reclaimThreshold": "200000000000000000",
            "target": "100000000000000000",
            "collateralizeThreshold": "50000000000000000"
        },
        {
            "chainId": 1337,
            "assetId": "0x8CdaF0CD259887258Bc13a92C0a6dA92698644C0",
            "reclaimThreshold": "2000000000000000000",
            "target": "1000000000000000000",
            "collateralizeThreshold": "500000000000000000"
        },
        {
            "chainId": 1338,
            "assetId": "0x8CdaF0CD259887258Bc13a92C0a6dA92698644C0",
            "reclaimThreshold": "2000000000000000000",
            "target": "1000000000000000000",
            "collateralizeThreshold": "500000000000000000"
        }
    ]
}
const project = 'vector'
const production = 'false'
const eth_mnemonic = 'candy maple cake sugar pudding cream honey rich smooth crumble sweet treat'
const eth_mnemonic_file = "";

const stack_secrets = ''
const VECTOR_CONFIG = node_config_json;
const VECTOR_PROD = false;
const node_internal_port = "8000"
const VECTOR_NODE_URL = 'http://node:' + node_internal_port;
const VECTOR_DATABASE_URL = ""
const VECTOR_PG_DATABASE = "vector"
const VECTOR_PG_HOST = "database-node"
const VECTOR_PG_PASSWORD = ""
//or 'vector for password
const VECTOR_PG_PASSWORD_FILE = '/run/secrets/$db_secret'
const VECTOR_PG_PORT = '5432'
const VECTOR_PG_USERNAME = 'vector'


export const docker_compose_configuration =
    `version: '3.4'

networks:
  ${project}:
    external: true

${stack_secrets}

volumes:
  certs:
  database_node:
  database_router:
  prometheus:
  grafana:

services:

  node:
    $common
    $node_image
    environment:
      VECTOR_CONFIG: ${node_config_json}
      VECTOR_PROD: ${production}
      VECTOR_MNEMONIC: '${eth_mnemonic}'
      VECTOR_MNEMONIC_FILE: '${eth_mnemonic_file}
      VECTOR_DATABASE_URL: ${VECTOR_DATABASE_URL}
      VECTOR_PG_DATABASE: 
      VECTOR_PG_HOST: 'database-node'
      VECTOR_PG_PASSWORD: '$pg_password'
      VECTOR_PG_PASSWORD_FILE: '$pg_password_file'
      VECTOR_PG_PORT: '5432'
      VECTOR_PG_USERNAME: '$pg_user'

  router:
    $common
    $router_image
    environment:
      VECTOR_CONFIG: ${node_config_json}
      VECTOR_PROD: ${production}
      VECTOR_NODE_URL: 'http://node:$node_internal_port'
      VECTOR_DATABASE_URL: '$database_url'
      VECTOR_PG_DATABASE: '$pg_db'
      VECTOR_PG_HOST: 'database-router'
      VECTOR_PG_PASSWORD: '$pg_password'
      VECTOR_PG_PASSWORD_FILE: '$pg_password_file'
      VECTOR_PG_PORT: '5432'
      VECTOR_PG_USERNAME: '$pg_user'
      VECTOR_MNEMONIC: '${eth_mnemonic}'
      VECTOR_MNEMONIC_FILE: '${eth_mnemonic_file}'

  database-node:
    $common
    $database_image_node
    environment:
      AWS_ACCESS_KEY_ID: '$aws_access_id'
      AWS_SECRET_ACCESS_KEY: '$aws_access_key'
      POSTGRES_DB: '$pg_db'
      POSTGRES_PASSWORD: '$pg_password'
      POSTGRES_PASSWORD_FILE: '$pg_password_file'
      POSTGRES_USER: '$project'
      VECTOR_ADMIN_TOKEN: '$admin_token'
      VECTOR_PROD: '$production'

  database-router:
    $common
    $database_image_router
    environment:
      AWS_ACCESS_KEY_ID: '$aws_access_id'
      AWS_SECRET_ACCESS_KEY: '$aws_access_key'
      POSTGRES_DB: '$pg_db'
      POSTGRES_PASSWORD: '$pg_password'
      POSTGRES_PASSWORD_FILE: '$pg_password_file'
      POSTGRES_USER: '$project'
      VECTOR_ADMIN_TOKEN: '$admin_token'
      VECTOR_PROD: '$production'

  $observability_services

EOF`