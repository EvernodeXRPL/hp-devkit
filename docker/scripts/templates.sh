#!/bin/bash
cmd=$1

templates_dir="/code-templates"
usage="Usage:
        \nlist <platform>"

if [ "$cmd" = "list" ]; then
  platform=$2

  if [ ! -z $platform ]; then
    platforms=("$templates_dir/$platform")
  else
    platforms="$templates_dir/*"
  fi

  for p in $platforms; do
    [ ! -d "$p" ] && echo "There are no templates for platform: ${p##*/}." && exit 0
    echo "$(tput bold)PLATFORM: ${p##*/}$(tput sgr0)"
    for t in $(ls -1 "$p"); do
      echo "  $t"
    done
  done
fi

exit 0
