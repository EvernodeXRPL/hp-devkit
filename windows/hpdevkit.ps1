$GlobalPrefix = "hpdevkit"

$Cluster = if ($env:HP_CLUSTER) { $env:HP_CLUSTER } else { "default" };
$ClusterSize = if ($env:HP_CLUSTER_SIZE) { $env:HP_CLUSTER_SIZE } else { 1 };
$DefaultNode = if ($env:HP_DEFAULT_NODE) { $env:HP_DEFAULT_NODE } else { 1 };
$DevKitImage = if ($env:HP_DEVKIT_IMAGE) { $env:HP_DEVKIT_IMAGE } else { "hpdevkit" };
$InstanceImage = if ($env:HP_INSTANCE_IMAGE) { $env:HP_INSTANCE_IMAGE } else { "evernodedev/hotpocket:latest-ubt.20.04-njs.16" };

$VolumeMount = "/$($GlobalPrefix)_vol"
$Volume = "$($GlobalPrefix)_$($Cluster)_vol"
$Network = "$($GlobalPrefix)_$($Cluster)_net"
$ContainerPrefix = "$($GlobalPrefix)_$($Cluster)_node"
$BundleMount = "$($VolumeMount)/contract_bundle"
$DeploymentContainerName = "$($GlobalPrefix)_$($Cluster)_deploymgr"
$CodegenContainerName = "$($GlobalPrefix)_codegen"
$ConfigOverridesFile = "hp.cfg.override"
$CodegenOutputDir = "/codegen-output"
$DefaultCodegenProject = "hpdevkitproject"

function DevKitContainer([string]$Mode, [string]$Name, [switch]$Detached, [switch]$AutoRemove, [switch]$MountSock, [switch]$MountVolume, [string]$EntryPoint, [string]$Cmd, [switch]$Status) {

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
        # We mount the host docker socket into the container so we can use it to issue commands to the docker host.
        # We use this ability to spin up other containers (Hot Pocket nodes) on the host.
        $Command += " --mount type=bind,src=/var/run/docker.sock,dst=/var/run/docker.sock"
    }
    if ($MountVolume) {
        $Command += " --mount type=volume,src=$($Volume),dst=$($VolumeMount)"
    }

    if ($EntryPoint) {
        $Command += " --entrypoint $($EntryPoint)"
    }
    else {
        $Command += " --entrypoint /bin/bash"
    }

    # Pass environment variables used by our scripts.
    $Command += " -e CLUSTER=$($Cluster) -e CLUSTER_SIZE=$($ClusterSize) -e DEFAULT_NODE=$($DefaultNode) -e VOLUME=$($Volume) -e NETWORK=$($Network)"
    $Command += " -e CONTAINER_PREFIX=$($ContainerPrefix) -e VOLUME_MOUNT=$($VolumeMount) -e BUNDLE_MOUNT=$($BundleMount) -e HOTPOCKET_IMAGE=$($InstanceImage)"
    $Command += " -e CONFIG_OVERRIDES_FILE=$($ConfigOverridesFile) -e CODEGEN_OUTPUT=$($CodegenOutputDir)"

    $Command += " $($DevKitImage)"
    if ($Cmd) {
        if ($EntryPoint) {
            $Command += " $($Cmd)"
        }
        else {
            $Command += " -c '$($Cmd)'"
        }
    }

    Invoke-Expression $Command 2>&1 | Write-Host

    if ($Status) {
        if ($LASTEXITCODE -eq 0) {
            return $True
        }
        else {
            return $False
        }
    }
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

        # Bind the instance mesh network config together.
        ExecuteInDeploymentContainer -Cmd "cluster bindmesh"
    }
}

function TeardownDeploymentCluster() {
    $Null = docker stop $DeploymentContainerName *>&1
    $Null = docker rm $DeploymentContainerName *>&1
    DevKitContainer -Mode "run" -AutoRemove -MountSock -Cmd "cluster stop ; cluster destroy"
}

Function Deploy([string]$Path) {

    if ($Path) {
        
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
    else {
        Write-Host "Please specify directory or file path to deploy."
    }
}

Function CodeGenerator() {
    $ProjName = $args[2]
    if (Test-Path -Path $ProjName) {
        "Directory '$($ProjName)' already exists."
        return
    }

    if (DevKitContainer -Status -Mode "run" -Name $CodegenContainerName -EntryPoint "codegen" -Cmd "$($args[0]) $($args[1]) $($ProjName)") {
        docker cp "$($CodegenContainerName):$($CodegenOutputDir)" ./$ProjName
        Write-Host "Project '$($ProjName)' created."
    }
    docker rm "$($CodegenContainerName)" 2>&1 | Out-Null
}


$Command = $args[0]
$CommandError = "Invalid command. Expected: deploy | clean | start | stop | logs | gen"
if ($Command) {

    if ($Command -eq "gen") {
        Write-Host "Hot Pocket devkit code generator"
        CodeGenerator $args[1] $args[2] $args[3]
    }
    else {
        Write-Host "Hot Pocket devkit launcher"
        Write-Host "command: $($Command) (cluster: $($Cluster))"
        if ($Command -eq "deploy") {
            Deploy -Path $args[1]
        }
        elseif ($Command -eq "clean") {
            TeardownDeploymentCluster
        }
        elseif ($Command -eq "logs" -OR $Command -eq "start" -OR $Command -eq "stop") {
            DevKitContainer -Mode "run" -AutoRemove -MountSock -EntryPoint "cluster" -Cmd "$($args)"
        }
        else {
            Write-Host $CommandError
        }
    }
}
else {
    Write-Host $CommandError
}