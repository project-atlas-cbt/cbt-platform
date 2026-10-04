#!/usr/bin/env bash
# B22: PostgreSQL restore_command for the encrypted WAL archive.
#   restore-wal.sh <archive dir> <age identity file> %f %p
# Decrypts one archived segment into place. The newest segment is archived
# as <name>.partial (it was still being written when the server stopped);
# recovery asks for it by its full name, so the partial copy answers.
set -euo pipefail
archive=$1 identity=$2 name=$3 dest=$4
for candidate in "$archive/$name.age" "$archive/$name.partial.age"; do
  if [[ -f $candidate ]]; then
    exec age -d -i "$identity" -o "$dest" "$candidate"
  fi
done
exit 1
