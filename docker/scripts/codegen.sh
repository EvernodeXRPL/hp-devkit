#!/bin/bash
platform=$1
apptype=$2
projname=$3

templates_dir="/code-templates"
placeholder="projname"
output_dir=$CODEGEN_OUTPUT

if [ -z $platform ] || [ -z $apptype ] || [ -z $projname ] || [ -z $templates_dir ] || [ -z $output_dir ] ; then
    echo "Mandatory args missing." && exit 1
fi

[ ! -d $templates_dir/$platform ] && echo "Invalid platform specified." && exit 1
[ ! -d $templates_dir/$platform/$apptype ] && echo "Invalid application type specified." && exit 1

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