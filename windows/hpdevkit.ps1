$GlobalPrefix = "hpdevkit"
$DevKitImage = "hpdevkit"
$VolumeMount = "/devkitvol"
$HotPocketImage = "evernodedev/hotpocket:latest-ubt.20.04-njs.16"

$Cluster = if ($env:HP_CLUSTER) { $env:HP_CLUSTER } else { "default" };
$ClusterSize = if ($env:HP_CLUSTER_SIZE) { $env:HP_CLUSTER_SIZE } else { 1 };
$DefaultNode = if ($env:HP_DEFAULT_NODE) { $env:HP_DEFAULT_NODE } else { 1 };
$Volume = "$($GlobalPrefix)_$($Cluster)_vol"
$Network = "$($GlobalPrefix)_$($Cluster)_net"
$ContainerPrefix = "$($GlobalPrefix)_$($Cluster)_con"
$BundleMount = "$($VolumeMount)/contract_bundle"
$DeploymentContainerName = "$($GlobalPrefix)_$($Cluster)_deploymanager"

function DevKitContainer([string]$Mode, [string]$Name, [switch]$Detached, [switch]$AutoRemove, [switch]$MountSock, [switch]$MountVolume, [string]$Cmd) {

    $Command = "docker $($Mode) -it"
    if ($Name) {
        $Command += " --name $($Name)"
    }
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
        $Command += " /bin/bash -c '$($Cmd)'"
    }

    Invoke-Expression $Command
}

function ExecuteInDeploymentContainer([string]$Cmd) {
    docker exec -it $DeploymentContainerName /bin/bash -c $Cmd
}

function InitializeDeploymentCluster() {
    $Null = docker inspect $DeploymentContainerName *>&1
    if (! ($?)) {
        Write-Host "Initializing deployment cluster"

        # Stop cluster if running. Create cluster if not exists.
        DevKitContainer -Mode "run" -AutoRemove -MountSock -Cmd "cluster stop ; cluster create"

        # Spin up management container.
        DevKitContainer -Mode "run" -Name $DeploymentContainerName -Detached -MountSock -MountVolume
    }
}

function TeardownDeploymentCluster() {
    $Null = docker stop $DeploymentContainerName *>&1
    $Null = docker rm $DeploymentContainerName *>&1
    DevKitContainer -Mode "run" -AutoRemove -MountSock -Cmd "cluster stop ; cluster destroy"
}

Function Deploy([string]$Path) {

    InitializeDeploymentCluster

    # If copying a directory, delete target bundle directory. If not create empty target bundle directory to copy a file.
    $PrepareBundleDir = ""
    if ((Get-Item $Path) -is [System.IO.DirectoryInfo]) {
        $PrepareBundleDir = "rm -rf $($BundleMount)"
    }
    else {
        $PrepareBundleDir = "mkdir -p $($BundleMount) && rm -rf $($BundleMount)/* $($BundleMount)/.??*"
    }
    ExecuteInDeploymentContainer -Cmd $PrepareBundleDir
    docker cp $Path "$($DeploymentContainerName):$($BundleMount)"

    # Sync contract bundle to all instance directories in the cluster.
    ExecuteInDeploymentContainer -Cmd "cluster stop ; cluster sync ; cluster start"

    if ($DefaultNode -gt 0) {
        Write-Host "Streaming logs of node $($DefaultNode):"
        ExecuteInDeploymentContainer -Cmd "cluster logs $($DefaultNode)"
    }
}

Write-Host "Hot Pocket devkit launcher"

$Command = $args[0]
if ($Command) {

    Write-Host "command: $($Command) (cluster: $($Cluster))"

    if ($Command -eq "deploy") {
        $Path = $args[1]
        if ($Path) {
            Deploy -Path $Path
        }
        else {
            Write-Host "Please specify directory or file path to deploy."
        }
    }
    elseif ($Command -eq "clean") {
        TeardownDeploymentCluster
    }
    elseif ($Command -eq "logs" -OR $Command -eq "start" -OR $Command -eq "stop") {
        DevKitContainer -Mode "run" -AutoRemove -MountSock -Cmd "cluster $($args)"
    }
    else {
        Write-Host "Invalid command. Expected: deploy | clean | logs"
    }
}
else {
    Write-Host "Please specify command."
}