#!/bin/bash
command=$1

cluster=$CLUSTER
cluster_size=$CLUSTER_SIZE
volume=$VOLUME
network=$NETWORK
container_prefix=$CONTAINER_PREFIX
volume_mount=$VOLUME_MOUNT
bundle_mount=$BUNDLE_MOUNT
hotpocket_image=$HOTPOCKET_IMAGE

if [ "$command" = "create" ] || [ "$command" = "destroy" ] || [ "$command" = "start" ] || [ "$command" = "stop" ] ||
    [ "$command" = "logs" ] || [ "$command" = "sync" ] ; then
    echo "sub-command: $command"
else
    echo "Invalid sub-command."
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
    echo "$volume_mount/node$1"
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

    echo "Creating '$cluster' cluster of size $1"
    docker volume create $volume
    docker network create $network

    for ((i=1; i<=$1; i++));
    do
        # Create contract instance directory.
        docker run --rm --mount type=volume,src=$volume,dst=$volume_mount --rm $hotpocket_image new $volume_mount/node$i

        # Create container for hot pocket instance.
        local container_name="${container_prefix}_$i"
        docker container create --name $container_name --privileged --mount type=volume,src=$volume,dst=$volume_mount $hotpocket_image run $(contract_dir_mount_path $i)
    done
}

function destroy_cluster {
    ensure_cluser_exists

    # Delete top-most matching container N times.
    # (This is just in case there are gaps in container numbering due to any tampering by user)
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

    local action=$1
    local node=$2
    local container_count=$(get_container_count)
    for ((i=1; i<=$container_count; i++));
    do
        # If valid node no. has been specified, target that node. Otherwise target all nodes.
        if ! [ "$node" -eq "$node" ] 2> /dev/null || [ $node -le 0 ] || [ $i -eq $node ] ; then
            local container_name="${container_prefix}_$i"
            docker $action $container_name
        fi
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
    ! validate_node_num_arg $cluster_size && echo "Invalid cluster size." && exit 1
    create_cluster $cluster_size
elif [ $command = "destroy" ]; then
    destroy_cluster
elif [ $command = "start" ]; then
    change_cluster_status start $2
elif [ $command = "stop" ]; then
    change_cluster_status stop $2
elif [ $command = "logs" ]; then
    ! validate_node_num_arg $2 && echo "Usage: logs <node id>" && exit 1
    attach_logs $2
elif [ $command = "sync" ]; then
    sync_contract_bundle
fi