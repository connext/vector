#!/bin/bash

echo "Proxy container launched in env:"
echo "VECTOR_DOMAINNAME=$VECTOR_DOMAINNAME"
echo "VECTOR_EMAIL=$VECTOR_EMAIL"
echo "VECTOR_NODE_URL=$VECTOR_NODE_URL"

export VECTOR_EMAIL="${VECTOR_EMAIL:-noreply@gmail.com}"

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

echo "waiting for $VECTOR_NODE_URL..."
wait-for -q -t 60 "$VECTOR_NODE_UR" 2>&1 | sed '/nc: bad address/d'
while ! curl -s "$VECTOR_NODE_URL" > /dev/null
do sleep 2
done

# Kill the loading message server
kill "$loading_pid" && pkill nc

if [[ -z "$VECTOR_DOMAINNAME" ]]
then
  cp /etc/ssl/cert.pem ca-certs.pem
  echo "Entrypoint finished, executing haproxy in http mode..."; echo
  exec haproxy -db -f http.cfg
fi

########################################
# Setup SSL Certs

letsencrypt=/etc/letsencrypt/live
certsdir=$letsencrypt/$VECTOR_DOMAINNAME
mkdir -p /etc/haproxy/certs
mkdir -p /var/www/letsencrypt

if [[ "$VECTOR_DOMAINNAME" == "localhost" && ! -f "$certsdir/privkey.pem" ]]
then
  echo "Developing locally, generating self-signed certs"
  mkdir -p "$certsdir"
  openssl req -x509 -newkey rsa:4096 -keyout "$certsdir/privkey.pem" -out "$certsdir/fullchain.pem" -days 365 -nodes -subj '/CN=localhost'
fi

if [[ ! -f "$certsdir/privkey.pem" ]]
then
  echo "Couldn't find certs for $VECTOR_DOMAINNAME, using certbot to initialize those now.."
  certbot certonly --standalone -m "$VECTOR_EMAIL" --agree-tos --no-eff-email -d "$VECTOR_DOMAINNAME" -n
  code=$?
  if [[ "$code" -ne 0 ]]
  then
    echo "certbot exited with code $code, freezing to debug (and so we don't get throttled)"
    sleep 9999 # FREEZE! Don't pester eff & get throttled
    exit 1;
  fi
fi

echo "Using certs for $VECTOR_DOMAINNAME"

export VECTOR_CERTBOT_PORT=31820

function copycerts {
  if [[ -f $certsdir/fullchain.pem && -f $certsdir/privkey.pem ]]
  then cat "$certsdir/fullchain.pem" "$certsdir/privkey.pem" > "$VECTOR_DOMAINNAME.pem"
  elif [[ -f "$certsdir-0001/fullchain.pem" && -f "$certsdir-0001/privkey.pem" ]]
  then cat "$certsdir-0001/fullchain.pem" "$certsdir-0001/privkey.pem" > "$VECTOR_DOMAINNAME.pem"
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
      echo -n "Found certs to renew for $VECTOR_DOMAINNAME... "
      certbot renew -n --standalone --http-01-port=$VECTOR_CERTBOT_PORT
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
