#!/bin/bash
command=$1

cluster=$CLUSTER
cluster_size=$CLUSTER_SIZE
volume=$VOLUME
network=$NETWORK
container_prefix=$CONTAINER_PREFIX
volume_mount=$VOLUME_MOUNT
bundle_mount=$BUNDLE_MOUNT
disparate_dir=$DISPARATE_DIR
hotpocket_image=$HOTPOCKET_IMAGE
config_overrides_file=$CONFIG_OVERRIDES_FILE
user_port_begin=$HP_USER_PORT_BEGIN
peer_port_begin=$HP_PEER_PORT_BEGIN

if [ "$command" = "create" ] || [ "$command" = "bindmesh" ] || [ "$command" = "destroy" ] || \
    [ "$command" = "start" ] || [ "$command" = "stop" ] || [ "$command" = "spawn" ] || \
    [ "$command" = "logs" ] || [ "$command" = "sync" ] || [ "$command" = "status" ] ; then
    echo "sub-command: $command"
else
    echo "Invalid sub-command."
    echo "Expected: create | destroy | start | stop | spawn | logs | sync | status"
    exit 1
fi

[ -z $cluster ] && echo "Cluster name not specified." && exit 1

function validate_node_num_arg {
    ! [ "$1" -eq "$1" ] 2> /dev/null && echo "Arg must be a number." && return 1
    [ $1 -le 0 ] && echo "Arg must be 1 or higher." && return 1
    return 0
}

function validate_port {
    ! [ "$1" -eq "$1" ] 2> /dev/null && echo "Port must be a number." && return 1
    ([ $1 -lt 1 ] || [ $1 -gt 65535 ]) && echo "Port number must be 1 through 65535." && return 1
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

function create_instance {
    local node=$1
    # Create contract instance directory.
    docker run --rm --mount type=volume,src=$volume,dst=$volume_mount --rm $hotpocket_image new $volume_mount/node$node

    let peer_port=$(($peer_port_begin + $node - 1))
    let user_port=$(($user_port_begin + $node - 1))

    # Create container for hotpocket instance.
    local container_name="${container_prefix}_$node"
    docker container create --name $container_name --privileged \
        -p $user_port:$user_port --network $network --network-alias node$node --restart unless-stopped \
        --mount type=volume,src=$volume,dst=$volume_mount $hotpocket_image run $(contract_dir_mount_path $node)
}

function change_instance_status {
    local action=$1
    local node=$2
    local container_name="${container_prefix}_$node"
    docker $action $container_name
}


# Function to generate JSON array string while skiping a given index.
function joinarr {
    local arrname=$1[@]
    local arr=("${!arrname}")
    local ncount=$2
    local skip=$3

    let prevlast=$ncount-2
    # Resetting prevlast if nothing is given to skip.
    [ $skip -lt 0 ] && let prevlast=prevlast+1

    local j=0
    local str="["
    for (( i=0; i<$ncount; i++ ))
    do
        if [ "$i" != "$skip" ]
        then
            str="$str\"${arr[i]}\""
            [ $j -lt $prevlast ] && str="$str,"
            let j=j+1
        fi
    done
    str="$str]"
    echo $str
}

# Update all instances hotpocket configs so they connect to each other as a cluster.
function bind_mesh {
    local instance_count=$(get_container_count)

    # Collect pubkeys and peers of all nodes.
    local all_pubkeys
    local all_peers
    local contract_id
    for ((i=1; i<=$instance_count; i++));
    do  
        local contract_dir=$(contract_dir_mount_path $i)
        local cfg_file=$contract_dir/cfg/hp.cfg

        # Use first instance contract id for all instances.
        [ $i -eq 1 ] && contract_id=$(jq ".contract.id" $cfg_file)

        # Assign user and peer ports in incrementing order.
        let peer_port=$(($peer_port_begin + $i - 1))
        let user_port=$(($user_port_begin + $i - 1))

        jq ".contract.id=$contract_id | .contract.roundtime=2000 | .mesh.port=$peer_port | .user.port=$user_port" $cfg_file > $cfg_file.tmp \
            && mv $cfg_file.tmp $cfg_file

        all_pubkeys[i]=$(jq --raw-output ".node.public_key" $cfg_file)
        all_peers[i]="node$i:${peer_port}"
    done

    # Update unl and peer list for all instances.
    local unl=$(joinarr all_pubkeys $instance_count -1)
    for ((i=0; i<$instance_count; i++));
    do
        let node=$i+1
        local contract_dir=$(contract_dir_mount_path $node)
        local cfg_file=$contract_dir/cfg/hp.cfg
        local peers=$(joinarr all_peers $instance_count $i)
        jq ".contract.unl=$unl | .mesh.known_peers=$peers | .contract.consensus.mode=\"public\"" $cfg_file > $cfg_file.tmp && mv $cfg_file.tmp $cfg_file
    done
}

function create_cluster {
    ensure_cluser_not_exists

    local size=$1
    echo "Creating '$cluster' cluster of size $size"
    docker volume create $volume
    docker network create $network

    # Pull the docker image if not exists.
    if ! docker image inspect $hotpocket_image &>/dev/null;
    then
        echo "Pulling the docker image $hotpocket_image"
        docker pull $hotpocket_image
    fi

    for ((i=1; i<=$size; i++));
    do
        create_instance $i &
    done
    wait
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
    wait

    exists "volume" $volume && docker volume rm $volume
    exists "network" $network && docker network rm $network
}

function spawn_node {
    ensure_cluser_exists

    local old_count=$(get_container_count)
    local new_id=$((old_count+1))
    create_instance $new_id

    local tmp_dir=$(mktemp -d /tmp/hpdevkit.spawn.XXXXXX)
    local node1_cfg=$(contract_dir_mount_path 1)/cfg/hp.cfg
    local new_cfg=$(contract_dir_mount_path $new_id)/cfg/hp.cfg

    # Override new node's contract id and unl from the information from node1.

    # Copy node1 cfg to temp file and remove the information we don't need.
    jq 'del(.contract,.node.public_key,.node.private_key)' $node1_cfg > $tmp_dir/a.json
    jq '{contract:{id:.contract.id,execute:.contract.execute,unl:.contract.unl,log}}' $node1_cfg > $tmp_dir/b.json
    jq -s '.[0] * .[1]' $tmp_dir/a.json $tmp_dir/b.json > $tmp_dir/from-node1.json

    # Copy new cfg to temp file and remove the information we don't need.
    jq 'del(.contract.unl,.contract.id)' $new_cfg > $tmp_dir/from-newnode.json

    jq -s '.[0] * .[1]' $tmp_dir/from-node1.json $tmp_dir/from-newnode.json > $tmp_dir/merged.json

    # Construct the list of all known peers.
    local all_peers
    for ((i=1; i<=$old_count; i++));
    do  
        # Assign peer ports in incrementing order.
        let peer_port=$(($peer_port_begin + $i - 1))
        all_peers[i]="node$i:${peer_port}"
    done

    # Inject the new node configuration to the cfg.
    local peers_json=$(joinarr all_peers $old_count -1)
    let peer_port=$(($peer_port_begin + $new_id - 1))
    let user_port=$(($user_port_begin + $new_id - 1))
    jq ".mesh.port=$peer_port | .user.port=$user_port | .mesh.known_peers=$peers_json" $tmp_dir/merged.json > $new_cfg

    # Cleanup temp dir.
    rm -r $tmp_dir

    # Start the new node.
    change_cluster_status start $new_id
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
            change_instance_status $action $i &
        fi
    done
    wait
}

function attach_logs {
    ! cluster_exists && echo "Cluster '$cluster' does not exist." && exit 1
    local node=$1
    [ "$1" -eq "999999" ] && node=$(get_container_count)
    local container_name="${container_prefix}_$node"
    docker logs -f --tail=5 $container_name
}

function sync_instance {
    local node=$1
    local contract_dir=$(contract_dir_mount_path $node)
    rm -rf $contract_dir/ledger_fs/* $contract_dir/contract_fs/*
    mkdir -p $contract_dir/contract_fs/seed
    cp -r $bundle_mount $contract_dir/contract_fs/seed/state
    rm -r $contract_dir/contract_fs/seed/state/$disparate_dir

    # Copy non-syncable files if exist.
    [ -d "$bundle_mount/$disparate_dir/$i" ] && cp -r "$bundle_mount/$disparate_dir/$i/." "$contract_dir/contract_fs/seed/"

    # Merge contract config overrides.
    local cfg_file=$contract_dir/cfg/hp.cfg
    local override_file=$contract_dir/contract_fs/seed/state/$config_overrides_file
    if [ -f $override_file ] ; then
        echo "Applying hp.cfg overrides"
        jq -s '.[0] * .[1]' $cfg_file $override_file > $cfg_file.merged
        mv $cfg_file.merged $cfg_file
        rm $override_file
    fi
}

function sync_contract_bundle {
    ensure_cluster_not_running
    local container_count=$(get_container_count)
    for ((i=1; i<=$container_count; i++));
    do
        sync_instance $i &
    done
    wait

    # Cleanup the original contract bundle dir which is used to sync from.
    rm -r $bundle_mount/*
}

function validate_port_begin {
    ! validate_port $user_port_begin && echo "Invalid user port begin." && exit 1
    ! validate_port $peer_port_begin && echo "Invalid peer port begin." && exit 1
}

function show_status {
    docker ps -a --format "table {{.Names}}\\t{{.State}}" | grep $container_prefix | sort
}

if [ $command = "create" ]; then
    ! validate_node_num_arg $cluster_size && echo "Invalid cluster size." && exit 1
    validate_port_begin
    create_cluster $cluster_size
elif [ $command = "bindmesh" ]; then
    validate_port_begin
    bind_mesh
elif [ $command = "destroy" ]; then
    destroy_cluster
elif [ $command = "start" ]; then
    change_cluster_status start $2
elif [ $command = "stop" ]; then
    change_cluster_status stop $2
elif [ $command = "spawn" ]; then
    spawn_node
elif [ $command = "logs" ]; then
    ! validate_node_num_arg $2 && echo "Usage: logs <node id>" && exit 1
    attach_logs $2
elif [ $command = "sync" ]; then
    sync_contract_bundle
elif [ $command = "status" ]; then
    show_status
fi