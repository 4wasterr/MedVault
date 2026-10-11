#!/bin/sh
set -eu
[ "$(id -u)" = 0 ] || { echo 'Run as root on the Ubuntu deployment host.' >&2; exit 1; }
: "${SSH_USER:?Set SSH_USER to an existing non-root administrator with an installed RSA 4096-bit public key}"
[ "$SSH_USER" != root ] || exit 1
home_directory=$(getent passwd "$SSH_USER" | cut -d: -f6)
[ -n "$home_directory" ] && [ -f "$home_directory/.ssh/authorized_keys" ] || { echo 'Install the administrator public key first.' >&2; exit 1; }
ssh-keygen -lf "$home_directory/.ssh/authorized_keys" | awk '$1 == 4096 && $NF == "(RSA)" { found=1 } END { exit !found }'
task_directory=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
install -m 600 "$task_directory/sshd.conf" /etc/ssh/sshd_config.d/00-medvault.conf
sshd -t
sshd -T | grep -q '^passwordauthentication no$'
sshd -T | grep -q '^permitrootlogin no$'
sshd -T | grep -q '^port 2222$'
ufw default deny incoming
ufw default allow outgoing
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 2222/tcp
# Keep the existing firewall and SSH session until a second key-authenticated session
# on port 2222 has been confirmed; the guide supplies the final enable command.
install -m 644 "$task_directory/fail2ban/medvault.conf" /etc/fail2ban/filter.d/medvault.conf
install -m 644 "$task_directory/fail2ban/medvault.local" /etc/fail2ban/jail.d/medvault.local
systemctl daemon-reload
systemctl restart ssh.socket || systemctl restart ssh
systemctl restart fail2ban
echo 'Verify a second key-authenticated SSH connection on port 2222, then enable UFW and remove any port-22 allow rule as documented.'
