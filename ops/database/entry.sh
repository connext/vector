#!/bin/bash
set -e

########################################
## Setup Env

# 60 sec/min * 30 min = 1800
backup_frequency="1800"
mkdir -p snapshots
backup_file="snapshots/`ls snapshots | sort -r | head -n 1`"
readonly_password="${INDRA_ADMIN_TOKEN:-cxt1234}"

########################################
## Helper functions

function log {
  echo "[ENTRY] $1"
}

function unlock {
  lock="/var/lib/postgresql/data/postmaster.pid"
  sleep 2
  while [[ -f "$lock" ]]
  do
    mode=${1:-fast}
    postmaster="`head -n1 $lock`"
    log "Waiting on lock for pid $postmaster to be released..."
    if [[ -n "`ps -o pid | grep $postmaster`" ]]
    then log "Process $postmaster is running, killing it now.." && kill $postmaster
    else log "Process $postmaster is NOT running, removing the lock now.." && rm $lock
    fi
    sleep 2
  done
}

# Set an exit trap so that the database will do one final backup before shutting down
function cleanup {
  log "Database exiting, creating final snapshot"
  bash backup.sh
  log "Shutting the database down"
  kill "$db_pid"
  unlock smart
  log "Clean exit."
}

trap cleanup SIGTERM

########################################
## Initialize against an isolated, temporary pg instance

log "Good morning"
if [[ ! -f "/var/lib/postgresql/data/PG_VERSION" ]]
then isFresh="true"
else isFresh="false"
fi

# Start temp database & wait until it wakes up
log "Starting temp database for initialization & backup recovery.."
unlock fast
docker-entrypoint.sh postgres &
PID=$!
while ! psql -U $POSTGRES_USER -d $POSTGRES_DB -c "select 1" > /dev/null 2>&1
do log "Waiting for db to wake up.." && sleep 1
done
log "Good morning, Postgres!"

# Is this a fresh database? Should we restore data from a snapshot?
if [[ "$isFresh" == "true" && -f "$backup_file" && "$INDRA_ENV" == "prod" ]]
then 
  log "Fresh postgres db started w backup present, we'll restore: $backup_file"
  psql --username=$POSTGRES_USER $POSTGRES_DB < $backup_file
  log "Done restoring db snapshot"
else
  log "Not restoring: Database exists ($isFresh) or no snapshots found ($backup_file) or not in prod-mode ($INDRA_ENV)"
fi

# Create a readonly user
psql --username=$POSTGRES_USER $POSTGRES_DB <<EOF
CREATE USER readonly;
ALTER USER readonly PASSWORD '$readonly_password';
GRANT SELECT ON ALL TABLES IN SCHEMA public TO readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO readonly;
EOF

log "Stopping old database.."
kill $PID
unlock smart

########################################
## Done w setup, launch the publically exposed pg instance

# Now that we've initialized the db, we can inject our custom config file
mkdir -p /var/lib/postgresql/data/pg_log
cp -f postgresql.conf /var/lib/postgresql/data/postgresql.conf

# Start backing up the db periodically
log "===> Starting backer upper"
while true
do sleep $backup_frequency && bash backup.sh
done &

# Start database to serve requests from clients
log "===> Starting new database.."
docker-entrypoint.sh postgres &
db_pid=$!
wait "$db_pid"
