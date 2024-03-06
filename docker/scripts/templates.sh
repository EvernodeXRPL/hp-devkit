#!/bin/bash
cmd=$1

templates_dir="/code-templates"
usage="Usage:
        \nlist <platform>"

if [ "$cmd" = "list" ]; then
  platform=$2
  [ -z $platform ] && echo "Platform is required. $usage" && exit 1
  [ ! -d "$templates_dir/$platform" ] && echo "There are no templates for platform: $platform." && exit 0

  ls -1 "$templates_dir/$platform"
fi

exit 0
