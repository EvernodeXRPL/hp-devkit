$GlobalPrefix = "hpdevkit"
$HotPocketImage = "evernodedev/hotpocket:latest-ubt.20.04-njs.16"
$DevKitImage = "hpdevkit"
$VolumeMount = "/devkitvol"

$Cluster = if ($env:HP_CLUSTER) { $env:HP_CLUSTER } else { "default" };
$Volume="$($GlobalPrefix)_$($Cluster)_vol"
$Network="$($GlobalPrefix)_$($Cluster)_net"
$ContainerPrefix="$($GlobalPrefix)_$($Cluster)_con"
$BundleMountPath="$($VolumeMount)/contract_bundle"

Function DeployContractFiles([string]$path) {
    $ContainerName = "hpdevkit_cptemp"

    # If copying a directory, delete target bundle directory. If not create empty target bundle directory to copy a file.
    $PrepareCommand = ""
    if ((Get-Item $path) -is [System.IO.DirectoryInfo]) {
       $PrepareCommand = "rm -rf $($BundleMountPath)"
    }
    else {
        $PrepareCommand = "mkdir -p $($BundleMountPath) && rm -rf $($BundleMountPath)/* $($BundleMountPath)/.??*"
    }
    $Null = docker rm $ContainerName *>&1
    docker run -d -it --name $ContainerName --mount type=volume,src=$Volume,dst=$VolumeMount --mount type=bind,src=/var/run/docker.sock,dst=/var/run/docker.sock $DevKitImage
    docker exec -it $ContainerName /bin/bash -c $PrepareCommand
    docker cp $path "$($ContainerName):$($BundleMountPath)"
    docker exec -it $ContainerName cluster sync
    docker stop $ContainerName
    docker rm $ContainerName
}

DeployContractFiles $args[0]