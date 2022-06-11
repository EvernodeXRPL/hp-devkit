$GlobalPrefix = "hpdevkit"
$DevKitImage = "hpdevkit"
$VolumeMount = "/devkitvol"
$HotPocketImage = "evernodedev/hotpocket:latest-ubt.20.04-njs.16"

$Cluster = if ($env:HP_CLUSTER) { $env:HP_CLUSTER } else { "default" };
$ClusterSize = if ($env:HP_CLUSTER_SIZE) { $env:HP_CLUSTER_SIZE } else { 1 };
$Volume = "$($GlobalPrefix)_$($Cluster)_vol"
$Network = "$($GlobalPrefix)_$($Cluster)_net"
$ContainerPrefix = "$($GlobalPrefix)_$($Cluster)_con"
$BundleMount = "$($VolumeMount)/contract_bundle"
$DevKitContainerName = "$($GlobalPrefix)_launcher"

function DevKitContainer([string]$Mode, [switch]$Detached, [switch]$AutoRemove, [switch]$MountSock, [switch]$MountVolume, [string]$Cmd) {
    $Command = "docker $($Mode) --name $($DevKitContainerName) -it"
    if ($Detached) {
        $Command += " -d"
    }
    if ($AutoRemove) {
        $Command += " --rm"
    }
    if ($MountSock) {
        $Command += " --mount type=bind,src=/var/run/docker.sock,dst=/var/run/docker.sock"
    }
    if ($MountVolume) {
        $Command += " --mount type=volume,src=$($Volume),dst=$($VolumeMount)"
    }

    # Env variables.
    $Command += " -e CLUSTER=$($Cluster) -e CLUSTER_SIZE=$($ClusterSize) -e VOLUME=$($Volume) -e NETWORK=$($Network)"
    $Command += " -e CONTAINER_PREFIX=$($ContainerPrefix) -e VOLUME_MOUNT=$($VolumeMount) -e BUNDLE_MOUNT=$($BundleMount) -e HOTPOCKET_IMAGE=$($HotPocketImage)"

    $Command += " $($DevKitImage)"
    if ($Cmd) {
        $Command += " $($Cmd)"
    }

    Invoke-Expression $Command
}

function RemoveDevKitContainer() {
    $Null = docker stop $DevKitContainerName *>&1
    $Null = docker rm $DevKitContainerName *>&1
}

function ExecuteInDevKitContainer([string]$Cmd) {
    docker exec -it $DevKitContainerName /bin/bash -c $Cmd
}

Function DeployContractFiles([string]$Path) {

    RemoveDevKitContainer
    DevKitContainer -Mode "run" -Detached -MountSock -MountVolume

    # If copying a directory, delete target bundle directory. If not create empty target bundle directory to copy a file.
    $PrepareBundleDir = ""
    if ((Get-Item $Path) -is [System.IO.DirectoryInfo]) {
        $PrepareBundleDir = "rm -rf $($BundleMount)"
    }
    else {
        $PrepareBundleDir = "mkdir -p $($BundleMount) && rm -rf $($BundleMount)/* $($BundleMount)/.??*"
    }
    ExecuteInDevKitContainer -Cmd $PrepareBundleDir
    docker cp $Path "$($DevKitContainerName):$($BundleMount)"
    
    # Sync contract bundle to all instance directories in the cluster.
    ExecuteInDevKitContainer -Cmd "cluster sync"

    RemoveDevKitContainer
}

$Command = $args[0]
Write-Host "Hot Pocket devkit"
Write-Host "command: $Command"

if ($Command -eq "deploy") {
    DeployContractFiles -Path $Path
}
elseif ($Command -eq "cluster") {
    DevKitContainer -Mode "run" -AutoRemove -MountSock -Cmd $args
}
else {
    Write-Host "Invalid command. Expected: deploy | cluster"
}