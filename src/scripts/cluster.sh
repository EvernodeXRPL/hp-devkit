#!/bin/bash
globalprefix="hpdevkit"
imgname="evernodedev/hotpocket:latest-ubt.20.04-njs.16"
volmount="/devkitvol"

command=$1
cluster="${HP_CLUSTER:-default}"
volume="${globalprefix}_${cluster}_vol"
network="${globalprefix}_${cluster}_net"
containerprefix="${globalprefix}_${cluster}_con"

echo "Hot Pocket development toolkit"

if [ "$command" = "create" ] || [ "$command" = "destroy" ] || [ "$command" = "start" ] || [ "$command" = "stop" ] || [ "$command" = "logs" ] ; then
    echo "command: $command"
else
    echo "Invalid command."
    echo "Expected: create | destroy | start | stop | logs"
    exit 1
fi

[ -z $cluster ] && echo "Cluster name not specified." && exit 1

function validatenodenumarg {
    ! [ "$1" -eq "$1" ] 2> /dev/null && echo "Arg must be a number." && return 1
    [ $1 -le 0 ] && echo "Arg must be 1 or higher." && return 1
    return 0
}

function exists {
    local output=$(docker $1 ls | grep $2)
    if [ -z "$output" ] ; then
        return 1
    else
        return 0
    fi
}

function clusterexists {
    if exists "volume" $volume || exists "network" $network || exists "container" $containerprefix ; then
        return 0
    else
        return 1
    fi
}

function getcontainercount {
    docker ps -a | grep $containerprefix | wc -l
}

function createcluster {
    clusterexists && echo "Cluster '$cluster' already exists." && exit 1
    docker volume create $volume
    docker network create $network

    for ((i=1; i<=$1; i++));
    do
        # Create contract instance directory.
        docker run --rm --mount type=volume,src=$volume,dst=$volmount --rm $imgname new $volmount/node$i

        # Create container for hot pocket instance.
        local containername="${containerprefix}_$i"
        docker container create --name $containername --privileged --mount type=volume,src=$volume,dst=$volmount $imgname run $volmount/node$i
    done
}

function destroycluster {
    ! clusterexists && echo "Cluster '$cluster' does not exist." && exit 1

    echo "action: stop"
    changeclusterstatus "stop"

    # Delete top-most matching container N times.
    # (This is just in case there are gaps in container numbering due to any tampering by user)
    echo "action: delete"
    local containercount=$(getcontainercount)
    for ((i=1; i<=$containercount; i++)); 
    do
        local containername="$(docker ps -a --format "{{.Names}}" | grep $containerprefix | head -1)"
        docker container rm $containername
    done

    exists "volume" $volume && docker volume rm $volume
    exists "network" $network && docker network rm $network
}

function changeclusterstatus {
    ! clusterexists && echo "Cluster '$cluster' does not exist." && exit 1

    local containercount=$(getcontainercount)
    for ((i=1; i<=$containercount; i++)); 
    do
        local containername="${containerprefix}_$i"
        docker $1 $containername
    done
}

function attachlogs {
    ! clusterexists && echo "Cluster '$cluster' does not exist." && exit 1
    local containername="${containerprefix}_$1"
    docker logs -f --tail=5 $containername
}

if [ $command = "create" ]; then
    ! validatenodenumarg $2 && echo "Usage: create <node count>" && exit 1
    createcluster $2
elif [ $command = "destroy" ]; then
    destroycluster
elif [ $command = "start" ]; then
    changeclusterstatus start
elif [ $command = "stop" ]; then
    changeclusterstatus stop
elif [ $command = "logs" ]; then
    ! validatenodenumarg $2 && echo "Usage: logs <node id>" && exit 1
    attachlogs $2
fi