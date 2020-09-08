#!/bin/bash

if [[ "${INDRA_ETH_PROVIDER_URL%%://*}" == "https" ]]
then export INDRA_ETH_PROVIDER_PROTOCOL="ssl"
else export INDRA_ETH_PROVIDER_PROTOCOL=""
fi

INDRA_ETH_PROVIDER_URL=${INDRA_ETH_PROVIDER_URL#*://}

if [[ "$INDRA_ETH_PROVIDER_PROTOCOL" == "ssl" ]]
then export INDRA_ETH_PROVIDER_HOST="${INDRA_ETH_PROVIDER_URL%%/*}:443"
else export INDRA_ETH_PROVIDER_HOST="${INDRA_ETH_PROVIDER_URL%%/*}"
fi

if [[ "$INDRA_ETH_PROVIDER_URL" == *"/"* ]]
then export INDRA_ETH_PROVIDER_PATH="/${INDRA_ETH_PROVIDER_URL#*/}"
else export INDRA_ETH_PROVIDER_PATH="/"
fi

echo "Proxy container launched in env:"
echo "INDRA_ETH_PROVIDER_HOST=$INDRA_ETH_PROVIDER_HOST"
echo "INDRA_ETH_PROVIDER_PATH=$INDRA_ETH_PROVIDER_PATH"
echo "INDRA_ETH_PROVIDER_PROTOCOL=$INDRA_ETH_PROVIDER_PROTOCOL"
echo "INDRA_DOMAINNAME=$INDRA_DOMAINNAME"
echo "INDRA_EMAIL=$INDRA_EMAIL"
echo "INDRA_ETH_PROVIDER_URL=$INDRA_ETH_PROVIDER_URL"
echo "INDRA_MESSAGING_TCP_URL=$INDRA_MESSAGING_TCP_URL"
echo "INDRA_MESSAGING_WS_URL=$INDRA_MESSAGING_WS_URL"
echo "INDRA_NODE_URL=$INDRA_NODE_URL"

# Provide a message indicating that we're still waiting for everything to wake up
function loading_msg {
  while true # unix.stackexchange.com/a/37762
  do echo -e "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\nWaiting for proxy to wake up" | nc -lk -p 80
  done > /dev/null
}
loading_msg &
loading_pid="$!"

########################################
# Wait for downstream services to wake up
# Define service hostnames & ports we depend on

echo "waiting for $INDRA_ETH_PROVIDER_HOST..."
wait-for -t 60 $INDRA_ETH_PROVIDER_HOST 2> /dev/null
while ! curl -s $INDRA_ETH_PROVIDER_HOST > /dev/null
do sleep 2
done

echo "waiting for $INDRA_MESSAGING_WS_URL..."
wait-for -t 60 $INDRA_MESSAGING_WS_URL 2> /dev/null

echo "waiting for $INDRA_MESSAGING_TCP_URL..."
wait-for -t 60 $INDRA_MESSAGING_TCP_URL 2> /dev/null

echo "waiting for $INDRA_NODE_URL..."
wait-for -t 60 $INDRA_NODE_URL 2> /dev/null
while ! curl -s $INDRA_NODE_URL > /dev/null
do sleep 2
done

# Kill the loading message server
kill "$loading_pid" && pkill nc

if [[ -z "$INDRA_DOMAINNAME" ]]
then
  cp /etc/ssl/cert.pem ca-certs.pem
  echo "Entrypoint finished, executing haproxy in http mode..."; echo
  exec haproxy -db -f http.cfg
fi

########################################
# Setup SSL Certs

letsencrypt=/etc/letsencrypt/live
certsdir=$letsencrypt/$INDRA_DOMAINNAME
mkdir -p /etc/haproxy/certs
mkdir -p /var/www/letsencrypt

if [[ "$INDRA_DOMAINNAME" == "localhost" && ! -f "$certsdir/privkey.pem" ]]
then
  echo "Developing locally, generating self-signed certs"
  mkdir -p $certsdir
  openssl req -x509 -newkey rsa:4096 -keyout $certsdir/privkey.pem -out $certsdir/fullchain.pem -days 365 -nodes -subj '/CN=localhost'
fi

if [[ ! -f "$certsdir/privkey.pem" ]]
then
  echo "Couldn't find certs for $INDRA_DOMAINNAME, using certbot to initialize those now.."
  certbot certonly --standalone -m $INDRA_EMAIL --agree-tos --no-eff-email -d $INDRA_DOMAINNAME -n
  code=$?
  if [[ "$code" -ne 0 ]]
  then
    echo "certbot exited with code $code, freezing to debug (and so we don't get throttled)"
    sleep 9999 # FREEZE! Don't pester eff & get throttled
    exit 1;
  fi
fi

echo "Using certs for $INDRA_DOMAINNAME"

export INDRA_CERTBOT_PORT=31820

function copycerts {
  if [[ -f $certsdir/fullchain.pem && -f $certsdir/privkey.pem ]]
  then cat $certsdir/fullchain.pem $certsdir/privkey.pem > "$INDRA_DOMAINNAME.pem"
  elif [[ -f "$certsdir-0001/fullchain.pem" && -f "$certsdir-0001/privkey.pem" ]]
  then cat "$certsdir-0001/fullchain.pem" "$certsdir-0001/privkey.pem" > "$INDRA_DOMAINNAME.pem"
  else
    echo "Couldn't find certs, freezing to debug"
    sleep 9999;
    exit 1
  fi
}

# periodically fork off & see if our certs need to be renewed
function renewcerts {
  sleep 3 # give proxy a sec to wake up before attempting first renewal
  while true
  do
    echo -n "Preparing to renew certs... "
    if [[ -d "$certsdir" ]]
    then
      echo -n "Found certs to renew for $INDRA_DOMAINNAME... "
      certbot renew -n --standalone --http-01-port=$INDRA_CERTBOT_PORT
      copycerts
      echo "Done!"
    fi
    sleep 48h
  done
}

renewcerts &

copycerts

cp /etc/ssl/cert.pem ca-certs.pem

echo "Entrypoint finished, executing haproxy in https mode..."; echo
exec haproxy -db -f https.cfg
