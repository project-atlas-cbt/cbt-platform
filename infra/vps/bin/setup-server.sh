#!/usr/bin/env bash
# One-time preparation of a fresh Ubuntu 24.04 VPS, run as root:
#   curl/scp this repository's infra/vps/bin/setup-server.sh, then
#   bash setup-server.sh <deploy-user-public-key>
# Installs Docker, opens only SSH/HTTP/HTTPS, turns on unattended security
# updates and swap, creates the `atlas` deploy user, and installs the
# nightly backup cron entry. Safe to re-run.
set -euo pipefail
pubkey=${1:?usage: setup-server.sh "<ssh public key for the atlas user>"}

apt-get update -qq
apt-get install -y -qq ca-certificates curl git ufw unattended-upgrades fail2ban openssl >/dev/null
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi

ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw allow 443/udp >/dev/null
ufw --force enable >/dev/null
dpkg-reconfigure -f noninteractive unattended-upgrades

if [ ! -f /swapfile ]; then
  fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

id atlas >/dev/null 2>&1 || useradd -m -s /bin/bash -G docker atlas
install -d -m 700 -o atlas -g atlas /home/atlas/.ssh
grep -qxF "$pubkey" /home/atlas/.ssh/authorized_keys 2>/dev/null || echo "$pubkey" >> /home/atlas/.ssh/authorized_keys
chown atlas:atlas /home/atlas/.ssh/authorized_keys && chmod 600 /home/atlas/.ssh/authorized_keys

# Key-only SSH.
sed -i 's/^#\?PasswordAuthentication .*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl reload ssh || systemctl reload sshd

# internal-tls.sh chowns certificate directories to the service users.
echo 'atlas ALL=(root) NOPASSWD: /home/atlas/cbt-platform/infra/vps/bin/internal-tls.sh' > /etc/sudoers.d/atlas-tls
chmod 440 /etc/sudoers.d/atlas-tls

cron_line='30 1 * * * cd /home/atlas/cbt-platform/infra/vps && bin/backup.sh >> backups/backup.log 2>&1'
# grep -v exits 1 when it keeps no lines (a fresh server has no crontab), which
# set -e inside the subshell would turn into a silent early exit.
( crontab -u atlas -l 2>/dev/null | grep -vF 'bin/backup.sh' || true; echo "$cron_line" ) | crontab -u atlas -
echo "server ready: sign in as atlas, clone the repository to ~/cbt-platform, then follow vps-pilot.md"
