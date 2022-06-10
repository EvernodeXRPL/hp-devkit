#!/bin/bash
globalprefix="hpdevkit"
imgname="evernodedev/hotpocket:latest-ubt.20.04-njs.16"
volmount="/devkitvol"

command=$1
cluster=$2
volume="${globalprefix}_${cluster}_vol"
network="${globalprefix}_${cluster}_net"
containerprefix="${globalprefix}_${cluster}_con"
nodecount=0

echo "Hot Pocket development toolkit"

if [ "$command" = "create" ] || [ "$command" = "destroy" ] ; then
    echo "command: $command"
else
    echo "Invalid command."
    echo "Expected: create | destroy"
    exit 1
fi

[ -z $cluster ] && echo "Cluster name not specified." && exit 1

function parsenodecountarg() {
    ! [ "$1" -eq "$1" ] 2> /dev/null && echo "Node count must be a number." && return 1
    [ $1 -le 0 ] && echo "Node count must be 1 or higher." && return 1
    nodecount=$1
}

function exists() {
    local output=$(docker $1 ls | grep $2)
    if [ -z "$output" ] ; then
        return 1
    else
        return 0
    fi
}

function clusterexists() {
    if exists "volume" $volume || exists "network" $network || exists "container" $containerprefix ; then
        return 0
    else
        return 1
    fi
}

function createcluster() {
    clusterexists && echo "Cluster '$cluster' already exists." && exit 1
    docker volume create $volume
    docker network create $network

    for ((i=1; i<=$nodecount; i++)); 
    do
        local containername="${containerprefix}_$i"
        docker container create --name $containername --privileged --mount type=volume,src=$volume,dst=$volmount $imgname
    done
}

function destroycluster() {
    ! clusterexists && echo "Cluster '$cluster' does not exist." && exit 1

    local containercount=$(docker ps -a | grep $containerprefix | wc -l)
    for ((i=1; i<=$containercount; i++)); 
    do
        local containername="${containerprefix}_$i"
        docker container rm $containername
    done

    exists "volume" $volume && docker volume rm $volume
    exists "network" $network && docker network rm $network
}

if [ $command = "create" ]; then
    ! parsenodecountarg $3 && echo "Usage: create <cluster name> <node count>" && exit 1
    createcluster
elif [ $command = "destroy" ]; then
    destroycluster
fi