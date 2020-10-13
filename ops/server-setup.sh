#!/bin/bash

root="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." >/dev/null 2>&1 && pwd )"
project="`cat $root/package.json | grep '"name":' | head -n 1 | cut -d '"' -f 4`"

hostname="$1"
prvkey="${SSH_KEY:-$HOME/.ssh/id_rsa}"
pubkey="${PUB_KEY:-$HOME/.ssh/autodeployer.pub}"
user="ubuntu"

secret_name="${project}_mnemonic" # name of docker secret to store mnemonic in

# Sanity checks
if [[ -z "$1" ]]
then echo "Provide the server's hostname or ip address as the first ($1) & only arg ($2)" && exit
fi

if [[ ! -f "$prvkey" ]]
then echo "Couldn't find the ssh private key: $prvkey" && exit
fi

# Prepare to load the node's signing key into the server's secret store
echo "Optional: Copy the $secret_name secret to your clipboard then paste it below & hit enter (no echo)"
echo -n "> "
read -s mnemonic
echo

# If we can login as ubuntu, then the user is already setup
echo "Attempting to login as $user to $hostname"
if ssh -q -i $prvkey $user@$hostname exit 2> /dev/null
then
	echo "Login success, skipping user setup"

# If we can login as root then setup a sudo user & turn off root login
elif ssh -q -i $prvkey root@$hostname exit 2> /dev/null
then
	echo "Failed to login, configuring a new $user user."
  ssh -i $prvkey root@$hostname "bash -s" <<-EOF
		set -e
		function createuser {
			adduser --gecos "" \$1 <<-EOIF
			password
			password
			EOIF
			usermod -aG sudo \$1
			mkdir -v /home/\$1/.ssh
			cat /root/.ssh/authorized_keys >> /home/\$1/.ssh/authorized_keys
			chown -vR \$1:\$1 /home/\$1
      passwd --delete \$1
		}

		createuser $user

    echo "Turning off password authentication"
		sed -i '/PasswordAuthentication/ c\
		PasswordAuthentication no
		' /etc/ssh/sshd_config

		echo "Turning off root login"
		sed -i '/PermitRootLogin/ c\
		PermitRootLogin no
		' /etc/ssh/sshd_config

		echo "Setting up password-less sudo access for user"
    echo "$user ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers.d/90-cloudimg-ubuntu

		echo "Done with setup as root, rebooting to apply login changes"
    shutdown --reboot now
	EOF
  echo "Waiting for server to wake up again ($?)"

  while ! ssh -q -i $prvkey $user@$hostname exit 2> /dev/null
  do echo -n "." && sleep 3
  done
  echo " Good morning!"
else
  ssh -i $prvkey $user@$hostname exit
  echo
  echo "Aborting: Can't login as $user or root, idk how to setup this server."
  exit 1
fi

if [[ -f "$pubkey" ]]
then
  echo "Copying $pubkey to remote server..."
  echo "scp -i $prvkey $pubkey $user@$hostname:/home/$user/.ssh/another_authorized_key"
  scp -i $prvkey $pubkey $user@$hostname:/home/$user/.ssh/another_authorized_key
fi

echo "Setting up dependencies for $user@$hostname"
ssh -i $prvkey $user@$hostname "sudo -S bash -s" <<EOF
set -e

cd /home/$user

# add our auto-deployer key to the guest list
if [[ -f ".ssh/another_authorized_key" ]]
then
  mv .ssh/authorized_keys .ssh/authorized_keys.backup
  cat .ssh/authorized_keys.backup .ssh/another_authorized_key | sort -u > .ssh/authorized_keys
  rm -f .ssh/another_authorized_key .ssh/authorized_keys.backup
fi

# Remove stale apt cache & lock files
rm -rf /var/lib/apt/lists/*

# Upgrade Everything without prompts
# https://askubuntu.com/questions/146921/how-do-i-apt-get-y-dist-upgrade-without-a-grub-config-prompt
apt-get update -y
DEBIAN_FRONTEND=noninteractive apt-get -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" dist-upgrade
apt-get autoremove -y

# Setup firewall
ufw --force reset
ufw allow 22 &&\
ufw --force enable

# Install docker dependencies
apt-get install -y apt-transport-https ca-certificates curl jq make software-properties-common

# Get the docker team's official gpg key
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | apt-key add -

# Add the docker repo & install
add-apt-repository "deb [arch=amd64] https://download.docker.com/linux/ubuntu \`lsb_release -cs\` stable"
apt-get update -y && apt-get install -y docker-ce

usermod -aG docker $user
systemctl enable docker

echo;
docker swarm init "--advertise-addr=eth0" || true
sleep 3
echo;

# Setup docker secret
if [[ -z "$mnemonic" ]]
then echo "No mnemonic provided, skipping secret creation"
elif [[ -n "\`docker secret ls | grep "$secret_name"\`" ]]
then echo "A secret called $secret_name already exists, skipping secret setup"
else
  id="\`echo $mnemonic | tr -d '\n\r' | docker secret create $secret_name -\`"
  if [[ "$?" == "0" ]]
  then
    echo "Successfully loaded mnemonic into secret store"
    echo "name=$secret_name id=\$id"
    echo
  else echo "Something went wrong creating secret called $secret_name"
  fi
fi

# Double-check upgrades
DEBIAN_FRONTEND=noninteractive apt-get -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" dist-upgrade
apt-get autoremove -y

if [[ ! -d vector ]]
then git clone https://github.com/connext/vector.git
fi

chown -R $user:$user .

echo
echo "Done configuring server, rebooting now.."
echo

reboot
EOF
