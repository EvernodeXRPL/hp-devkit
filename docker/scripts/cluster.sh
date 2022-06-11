#!/bin/bash
global_prefix="hpdevkit"
imgname="evernodedev/hotpocket:latest-ubt.20.04-njs.16"
volmount="/devkitvol"

command=$1
cluster="${HP_CLUSTER:-default}"
volume="${global_prefix}_${cluster}_vol"
network="${global_prefix}_${cluster}_net"
container_prefix="${global_prefix}_${cluster}_con"
bundle_mount="${volmount}/contract_bundle"

echo "Hot Pocket development toolkit"

if [ "$command" = "create" ] || [ "$command" = "destroy" ] || [ "$command" = "start" ] || [ "$command" = "stop" ] ||
    [ "$command" = "logs" ] || [ "$command" = "sync" ] ; then
    echo "command: $command"
else
    echo "Invalid command."
    echo "Expected: create | destroy | start | stop | logs | sync"
    exit 1
fi

[ -z $cluster ] && echo "Cluster name not specified." && exit 1

function validate_node_num_arg {
    ! [ "$1" -eq "$1" ] 2> /dev/null && echo "Arg must be a number." && return 1
    [ $1 -le 0 ] && echo "Arg must be 1 or higher." && return 1
    return 0
}

function contract_dir_mount_path {
    echo "$volmount/node$1"
}

function exists {
    local output=$(docker $1 ls | grep $2)
    if [ -z "$output" ] ; then
        return 1
    else
        return 0
    fi
}

function cluster_exists {
    if exists "volume" $volume || exists "network" $network || exists "container" $container_prefix ; then
        return 0
    else
        return 1
    fi
}

function ensure_cluser_exists {
    ! cluster_exists && echo "Cluster '$cluster' does not exist." && exit 1
}

function ensure_cluser_not_exists {
    cluster_exists && echo "Cluster '$cluster' already exists." && exit 1
}

function ensure_cluster_not_running {
    local running_containers=$(docker ps -a --filter "status=running" | grep $container_prefix | wc -l)
    [ "$running_containers" != "0" ] && echo "Cluster '$cluster' needs to be stopped." && exit 1
}

function get_container_count {
    docker ps -a | grep $container_prefix | wc -l
}

function create_cluster {
    ensure_cluser_not_exists
    docker volume create $volume
    docker network create $network

    for ((i=1; i<=$1; i++));
    do
        # Create contract instance directory.
        docker run --rm --mount type=volume,src=$volume,dst=$volmount --rm $imgname new $volmount/node$i

        # Create container for hot pocket instance.
        local container_name="${container_prefix}_$i"
        docker container create --name $container_name --privileged --mount type=volume,src=$volume,dst=$volmount $imgname run $(contract_dir_mount_path $i)
    done
}

function destroy_cluster {
    ensure_cluser_exists

    echo "action: stop"
    change_cluster_status "stop"

    # Delete top-most matching container N times.
    # (This is just in case there are gaps in container numbering due to any tampering by user)
    echo "action: delete"
    local container_count=$(get_container_count)
    for ((i=1; i<=$container_count; i++)); 
    do
        local container_name="$(docker ps -a --format "{{.Names}}" | grep $container_prefix | head -1)"
        docker container rm $container_name
    done

    exists "volume" $volume && docker volume rm $volume
    exists "network" $network && docker network rm $network
}

function change_cluster_status {
    ensure_cluser_exists

    local container_count=$(get_container_count)
    for ((i=1; i<=$container_count; i++)); 
    do
        local container_name="${container_prefix}_$i"
        docker $1 $container_name
    done
}

function attach_logs {
    ! cluster_exists && echo "Cluster '$cluster' does not exist." && exit 1
    local container_name="${container_prefix}_$1"
    docker logs -f --tail=5 $container_name
}

function sync_contract_bundle {
    ensure_cluster_not_running
    local container_count=$(get_container_count)
    for ((i=1; i<=$container_count; i++));
    do
        contract_dir=$(contract_dir_mount_path $i)
        rm -rf $contract_dir/ledger_fs/*  $contract_dir/contract_fs/*
        mkdir -p $contract_dir/contract_fs/seed
        cp -r $bundle_mount $contract_dir/contract_fs/seed/state
    done
}

if [ $command = "create" ]; then
    ! validate_node_num_arg $2 && echo "Usage: create <node count>" && exit 1
    create_cluster $2
elif [ $command = "destroy" ]; then
    destroy_cluster
elif [ $command = "start" ]; then
    change_cluster_status start
elif [ $command = "stop" ]; then
    change_cluster_status stop
elif [ $command = "logs" ]; then
    ! validate_node_num_arg $2 && echo "Usage: logs <node id>" && exit 1
    attach_logs $2
elif [ $command = "sync" ]; then
    sync_contract_bundle
fi