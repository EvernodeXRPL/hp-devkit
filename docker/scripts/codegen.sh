#!/bin/bash
platform=$1
apptype=$2
projname=$3

templates_dir="/code-templates"
placeholder="projname"
output_dir=$CODEGEN_OUTPUT
usage="Usage: <platform> <app type> <project name>"

if [ -z $templates_dir ] || [ -z $output_dir ] ; then
    echo "Mandatory values missing." && exit 1
fi

[ -z $platform ] && echo "Platform is required. $usage" && exit 1
[ -z $apptype ] && echo "App type is required. $usage" && exit 1
[ -z $projname ] && echo "Project name is required. $usage" && exit 1

[ ! -d $templates_dir/$platform ] && echo "Invalid platform '$platform' specified." && exit 1
[ ! -d $templates_dir/$platform/$apptype ] && echo "Invalid application type '$apptype' specified." && exit 1
if ! [[ "$projname" =~ ^[a-z][a-z0-9_-]*$ ]]; then
  echo "Invalid project name. Must be lowercase. Must start with a letter. Can only contain letters, numbers, dash and underscore."
  exit 1
fi

mkdir -p $output_dir && rm -rf $output_dir/*
cp -r $templates_dir/$platform/$apptype/* $output_dir

pushd $output_dir > /dev/null

# Replace placeholder in all file contents.
find -type f -exec sed -i "s/#${placeholder}#/${projname}/" {} \;

# Rename files with placeholder name.
for f in $(find -type f -name "*${placeholder}*")
do
    mv "$f" "$(echo "$f" | sed s/${placeholder}/${projname}/)"
done

popd > /dev/null