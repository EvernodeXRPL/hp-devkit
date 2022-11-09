$GlobalPrefix = "hpdevkit"
$Version = "0.1.0"

$Cluster = "default"
$ClusterSize = if ($env:HP_CLUSTER_SIZE) { $env:HP_CLUSTER_SIZE } else { 3 };
$DefaultNode = if ($env:HP_DEFAULT_NODE) { $env:HP_DEFAULT_NODE } else { 1 };
$DevKitImage = if ($env:HP_DEVKIT_IMAGE) { $env:HP_DEVKIT_IMAGE } else { "evernodedev/hpdevkit" };
$InstanceImage = if ($env:HP_INSTANCE_IMAGE) { $env:HP_INSTANCE_IMAGE } else { "evernodedev/hotpocket:latest-ubt.20.04-njs.16" };
$HpUserPortBegin = if ($env:HP_USER_PORT_BEGIN) { $env:HP_USER_PORT_BEGIN } else { 8081 };
$HpPeerPortBegin = if ($env:HP_PEER_PORT_BEGIN) { $env:HP_PEER_PORT_BEGIN } else { 22861 };

$VolumeMount = "/$($GlobalPrefix)_vol"
$Volume = "$($GlobalPrefix)_$($Cluster)_vol"
$Network = "$($GlobalPrefix)_$($Cluster)_net"
$ContainerPrefix = "$($GlobalPrefix)_$($Cluster)_node"
$BundleMount = "$($VolumeMount)/contract_bundle"
$DeploymentContainerName = "$($GlobalPrefix)_$($Cluster)_deploymgr"
$CodegenContainerName = "$($GlobalPrefix)_codegen"
$ConfigOverridesFile = "hp.cfg.override"
$CodegenOutputDir = "/codegen-output"
$CloudStorage = "https://stevernode.blob.core.windows.net/evernode-dev-bb7ec110-f72e-430e-b297-9210468a4cbb"
$HPDevKitExeUrl = "$($CloudStorage)/hpdevkit-windows/hpdevkit.exe";
$HPDevKitBackup = "\hpdevkit.exe.bak";
$ExePath = (Get-Process -Id $pid).Path

function DevKitContainer([string]$Mode, [string]$Name, [switch]$Detached, [switch]$AutoRemove, [switch]$MountSock, [switch]$MountVolume, [string]$EntryPoint, [string]$RestartPolicy, [string]$Cmd, [switch]$Status) {

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
        # We use this ability to spin up other containers (HotPocket nodes) on the host.
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

    if ($RestartPolicy) {
        $Command += " --restart $($RestartPolicy)"
    }

    # Pass environment variables used by our scripts.
    $Command += " -e CLUSTER=$($Cluster) -e CLUSTER_SIZE=$($ClusterSize) -e DEFAULT_NODE=$($DefaultNode) -e VOLUME=$($Volume) -e NETWORK=$($Network)"
    $Command += " -e CONTAINER_PREFIX=$($ContainerPrefix) -e VOLUME_MOUNT=$($VolumeMount) -e BUNDLE_MOUNT=$($BundleMount) -e HOTPOCKET_IMAGE=$($InstanceImage)"
    $Command += " -e CONFIG_OVERRIDES_FILE=$($ConfigOverridesFile) -e CODEGEN_OUTPUT=$($CodegenOutputDir)"
    $Command += " -e HP_USER_PORT_BEGIN=$($HpUserPortBegin) -e HP_PEER_PORT_BEGIN=$($HpPeerPortBegin)"

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
        DevKitContainer -Mode "run" -Name $DeploymentContainerName -Detached -MountSock -MountVolume -RestartPolicy "unless-stopped"

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

Function UpdateHPDevKit() {
    Write-Host "Checking for HotPocket devkit updates..."
    $ResHeaders = (Invoke-WebRequest -Uri $HPDevKitExeUrl -Method Head -UseBasicParsing).Headers
    $LastRemoteModifiedTime = [datetime]$ResHeaders["Last-Modified"]

    $currentExeModifiedTime = [datetime]((Get-ItemProperty -Path "$($ExePath)\hpdevkit.exe" -Name LastWriteTime).LastWriteTime).ToUniversalTime()
    if ($ResHeaders["Last-Modified"]) {
        if ($LastRemoteModifiedTime -lt $currentExeModifiedTime) {
            Write-Host "Your HotPocket devkit is up to date." 
        }
        else {
            Write-Host "An HotPocket devkit update is available."
            # Download the updated version.
            Write-Host "Downloading the update..."
            Invoke-WebRequest -Uri $HPDevKitExeUrl -OutFile "$($ExePath)\hpdevkit.exe.new"

            # Swap the files.
            Rename-Item -Path "$($ExePath)\hpdevkit.exe" -NewName "$($ExePath)\$($HPDevKitBackup)"
            Rename-Item -Path "$($ExePath)\hpdevkit.exe.new" -NewName "$($ExePath)\hpdevkit.exe"
            Write-Host "HotPocket devkit update completed !!"
        }

    }
    else {
        Write-Host "Could not check for hpdevkit updates. Online installer not found."
    }

    ## Pull the HPDevkit updated Docker Image from Docker Hub.
    Write-Host "Pulling the latest $DevKitImage Image."
    docker pull $DevKitImage

    ## Pull the updated Docker instance image from Docker Hub.
    Write-Host "Pulling the latest $InstanceImage Image."
    docker pull $InstanceImage

    ## Clear if there's already deployed cluster since they are outdated now.
    $Null = docker inspect $DeploymentContainerName *>&1
    if ($?) {
        Write-Host "Cleaning the deployed contracts."
        TeardownDeploymentCluster
    }

    Write-Host "Update Completed !!"
    Write-Host "NOTE: You need to re-deploy your contracts to make the new changes effective."
}

if ($ExePath.Contains('hpdevkit.exe')) {
    $ExePath = $ExePath.Replace("\hpdevkit.exe", "")
}
elseif ($ExePath.Contains('powershell.exe')) {
    # If Powershell script is used.
    $ExePath = $PSScriptRoot
}

if (Test-Path -Path "$($ExePath)\$($HPDevKitBackup)") {
    # Removing the previous version backup file when launching the new version.
    Remove-Item "$($ExePath)\$($HPDevKitBackup)"
}

Write-Host "HotPocket devkit launcher ($($Version))"

$Command = $args[0]
$CommandError = "Invalid command. Try 'hpdevkit help' for available commands."
$HelpMessage = "Available commands: hpdevkit <COMMAND> <ARGUMENTS if any>
    COMMANDS:
    deploy <Contract path>
    clean
    start <Node number>
    stop <Node number>
    logs <Node number>
    gen <Platform> <App type> <Project name>
    update
    help"

if ($Command) {

    if ($Command -eq "gen") {
        Write-Host "Code generator"
        CodeGenerator $args[1] $args[2] $args[3]
    }
    elseif ($Command -eq "help") {
        Write-Host $HelpMessage
    }
    elseif ($Command -eq "update") {
        try {
            if (Test-Path -Path "$($ExePath)\hpdevkit.exe") {
                UpdateHPDevKit
            }
            else {
                Write-Host "No HotPocket devkit executable file was found."
            }
        }
        catch { "An error occurred while updating." }
    }
    else {
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