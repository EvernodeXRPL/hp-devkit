#!/bin/bash
globalPrefix="hpdevkit"
version="0.1.0"

cluster="default"
clusterSize=$([ -z $HP_CLUSTER_SIZE ] && echo 1 || echo "$HP_CLUSTER_SIZE")
defaultNode=$([ -z $HP_DEFAULT_NODE ] && echo 1 || echo "$HP_DEFAULT_NODE")
devkitImage=$([ -z $HP_DEVKIT_IMAGE ] && echo "evernodedev/hpdevkit" || echo "$HP_DEVKIT_IMAGE")
instanceImage=$([ -z $HP_INSTANCE_IMAGE ] && echo "evernodedev/hotpocket:latest-ubt.20.04-njs.16" || echo "$HP_INSTANCE_IMAGE")

volumeMount=/$globalPrefix\_vol
volume=$globalPrefix\_$cluster\_vol
network=$globalPrefix\_$cluster\_net
containerPrefix=$globalPrefix\_$cluster\_node
bundleMount=$volumeMount/contract_bundle
deploymentContainerName=$globalPrefix\_$cluster\_deploymgr
codegenContainerName=$globalPrefix\_codegen
configOverridesFile="hp.cfg.override"
codegenOutputDir="/codegen-output"

cloudStorage="https://stevernode.blob.core.windows.net/evernode-beta"
bashScriptUrl="$cloudStorage/$globalPrefix-linux/$globalPrefix.sh"
hpdevkitDataDir="/etc/$globalPrefix"
versionTimestampFile="$hpdevkitDataDir/linuxlauncherscript.timestamp"
scriptBinPath="/usr/bin/$globalPrefix"

function devKitContainer() {
    command="docker $1 -it"
    if [ ! -z "$NAME" ]; then
        command+=" --name $NAME"
    fi

    if [ ! -z "$DETACHED" ]; then
        command+=" -d"
    fi

    if [ ! -z "$AUTOREMOVE" ]; then
        command+=" --rm"
    fi

    if [ ! -z "$MOUNTSOCK" ]; then
        command+=" --mount type=bind,src=/var/run/docker.sock,dst=/var/run/docker.sock"
    fi

    if [ ! -z "$MOUNTVOLUME" ]; then
        command+=" --mount type=volume,src=$volume,dst=$volumeMount"
    fi

    if [ ! -z "$ENTRYPOINT" ]; then
        command+=" --entrypoint $ENTRYPOINT"
    else
        command+=" --entrypoint /bin/bash"
    fi

    command+=" -e CLUSTER=$cluster -e CLUSTER_SIZE=$clusterSize -e DEFAULT_NODE=$defaultNode -e VOLUME=$volume -e NETWORK=$network"
    command+=" -e CONTAINER_PREFIX=$containerPrefix -e VOLUME_MOUNT=$volumeMount -e BUNDLE_MOUNT=$bundleMount -e HOTPOCKET_IMAGE=$instanceImage"
    command+=" -e CONFIG_OVERRIDES_FILE=$configOverridesFile -e CODEGEN_OUTPUT=$codegenOutputDir"

    command+=" $devkitImage"

    if [ ! -z "$CMD" ]; then
        if [ ! -z "$ENTRYPOINT" ]; then
            command+=" $CMD"
        else
            command+=" -c '$CMD'"
        fi
    fi

    eval $command
    lastExitedCode=$?
    if [ ! -z "STATUS" ]; then
        if [ $lastExitedCode -eq 0 ]; then
            return 0
        else
            return 1
        fi
    fi
}

function executeInContainer() {
    if [ ! -z "$CONTAINERNAME" ]; then
        cmd="docker exec -it $CONTAINERNAME /bin/bash -c '$1'"
        ! eval $cmd && echo "Docker execution failed."
    fi
}

function initializeDeploymentCluster() {
    docker inspect $deploymentContainerName &>/dev/null
    if [[ $? -gt 0 ]]; then
        echo "Initializing deployment cluster"

        # Stop cluster if running. Create cluster if not exists.
        AUTOREMOVE="true" MOUNTSOCK="true" CMD="cluster stop ; cluster create" devKitContainer run

        # Spin up management container.
        NAME="$deploymentContainerName" DETACHED="true" MOUNTSOCK="true" MOUNTVOLUME="true" devKitContainer run

        # Bind the instance mesh network config together.
        CONTAINERNAME="$deploymentContainerName" executeInContainer "cluster bindmesh"
    fi
}

function teardownDeploymentCluster() {
    docker stop $deploymentContainerName 2>/dev/null
    docker rm $deploymentContainerName 2>/dev/null
    AUTOREMOVE="true" MOUNTSOCK="true" CMD="cluster stop ; cluster destroy" devKitContainer run
}

function deploy() {
    if [ ! -z "$1" ]; then
        path="$1"
        echo "$path"
        initializeDeploymentCluster

        # If copying a directory, delete target bundle directory. If not create empty target bundle directory to copy a file.
        prepareBundleDir="  "
        if [[ -d "$path" ]]; then
            prepareBundleDir="rm -rf $bundleMount"

        else
            prepareBundleDir="mkdir -p $bundleMount && rm -rf $bundleMount/* $bundleMount/.??*"
        fi

        CONTAINERNAME="$deploymentContainerName" executeInContainer "$prepareBundleDir"
        docker cp "$path" "$deploymentContainerName:$bundleMount"

        # Sync contract bundle to all instance directories in the cluster.
        CONTAINERNAME="$deploymentContainerName" executeInContainer "cluster stop ; cluster sync ; cluster start"

        if [ $defaultNode -gt 0 ]; then
            echo "Streaming logs of node $defaultNode:"
            CONTAINERNAME="$deploymentContainerName" executeInContainer "cluster logs $defaultNode"
        fi

    else
        echo "Please specify directory or file path to deploy."
    fi
}

function codeGenerator() {
    platform=$1
    apptype=$2
    projName=$3
    if [[ -d $projName ]]; then
        echo "Directory '$projName' already exists."
        exit 1
    fi

    NAME="$codegenContainerName" ENTRYPOINT="codegen" STATUS="true" CMD="$platform $apptype $projName" devKitContainer run
    lastExitedCode=$?
    if [ $lastExitedCode == 0 ]; then
        ! docker cp $codegenContainerName:$codegenOutputDir ./$projName && echo "Project '$projName' generation failed." && exit 1
        echo "Project '$projName' created."
    fi

    docker rm $codegenContainerName &>/dev/null

}

function updateDevKit() {
    local latestVersionTimestamp=$(online_version_timestamp $bashScriptUrl)
    [ -z "$latestVersionTimestamp" ] && echo "Online launcher not found." && exit 1

    # If Timestamp file is not found, re-run the install function.
    if [ ! -f $versionTimestampFile ]; then
        install
    else
        local currentVersionTimestamp=$(cat $versionTimestampFile)
        if [ "$currentVersionTimestamp" == "$latestVersionTimestamp" ]; then
            echo "HotPocket devkit is already upto date."
        else
            echo "Found a new version of HotPocket devkit."
            ! rm $scriptBinPath && echo " Removing previous launcher failed"
            ! curl -fsSL $bashScriptUrl --output $scriptBinPath 2>&1 && echo "Error in downloading the new launcher."
            ! chmod +x $scriptBinPath &>/dev/null && echo "Error in changing permission for the launcher."
            echo $latestVersionTimestamp >$versionTimestampFile
        fi
    fi

    echo "Updating docker images..."
    docker pull $devkitImage &>/dev/null
    docker pull $instanceImage &>/dev/null

    echo "Update Completed."
    echo "NOTE: You need to re-deploy your contracts to make the new changes effective."
}

function online_version_timestamp() {
    # Send HTTP HEAD request and get last modified timestamp of the installer package or setup.sh.
    curl --silent --head $1 | grep 'Last-Modified:' | sed 's/[^ ]* //'
}

function install() {
    if [[ ! -d $hpdevkitDataDir ]]; then
        ! mkdir $hpdevkitDataDir && echo "Data path creation error." && exit 1
    fi

    # Copying the current script file to the bin directory
    ! curl -fsSL $bashScriptUrl --output $scriptBinPath 2>/dev/null && echo "Binary copying to '/usr/bin' failed." && exit 1
    ! chmod +x $scriptBinPath 2>&1 && echo "Error in changing permission for the launcher." && exit 1

    # Creating timestamp file
    local latestVersionTimestamp=$(online_version_timestamp $bashScriptUrl)
    echo $latestVersionTimestamp >$versionTimestampFile
}

function uninstall() {
    if [[ -d $hpdevkitDataDir ]]; then
        rm $hpdevkitDataDir/* 2>/dev/null
        rm -d $hpdevkitDataDir
    fi

    if [[ -f "/usr/bin/hpdevkit" ]]; then
        rm "$scriptBinPath"
    fi
}

function is_user_root() {
    [ "$(id -u)" -ne 0 ] && echo "Please run with root privileges (sudo)." && exit 1
}

echo "HotPocket devkit launcher ($version)"

funcCommand=$1
helpMessage="\nAvailable commands: hpdevkit <COMMAND> <ARGUMENTS if any>
                \n  COMMANDS:
                \n\tdeploy <Contract path>
                \n\tclean
                \n\tstart <Node number>
                \n\tstop <Node number>
                \n\tlogs <Node number>
                \n\tgen <Platform> <App type> <Project name>
                \n\tupdate
                \n\tuninstall
                \n\thelp"
funcCommandError="Invalid command. Try 'hpdevkit help' for available commands."

if [ ! -z "$funcCommand" ]; then
    if [ "$funcCommand" == "gen" ]; then
        echo "Code generator"
        codeGenerator $2 $3 $4
    elif [ "$funcCommand" == "update" ]; then
        is_user_root
        echo "Checking for updates..."
        updateDevKit
    elif [ "$funcCommand" == "install" ]; then
        is_user_root
        echo "Installing..."
        install
        echo "Installation completed."
        echo -e $helpMessage
    elif [ "$funcCommand" == "uninstall" ]; then
        is_user_root
        echo "Unstalling hpdevkit..."
        uninstall
        echo -e "Unstallation Completed.\nThank you for using HotPocket devkit !"
    elif [ "$funcCommand" == "help" ]; then
        echo -e $helpMessage
    else
        echo "command: $funcCommand (cluster: $cluster)"
        if [ "$funcCommand" == "deploy" ]; then
            deploy "$2"
        elif [ "$funcCommand" == "clean" ]; then
            teardownDeploymentCluster
        elif [[ "$funcCommand" == "logs" || "$funcCommand" == "start" || "$funcCommand" == "stop" ]]; then
            AUTOREMOVE="true" MOUNTSOCK="true" ENTRYPOINT="cluster" CMD="$1 $2" devKitContainer run
        else
            echo "$funcCommandError"
        fi
    fi
else
    echo -e $helpMessage
fi

exit 0