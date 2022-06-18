# Hot Pocket developer toolkit
Developer toolkit for Hot Pocket smart contract development. This toolkit makes use of Docker to provide a cross-platform development tools for developers. Using the toolkit, developers can spin-up local Hot Pocket clusters on their developer machines and test Hot Pocket smart contracts.

We use Docker containers to run Hot Pocket and smart contracts in a Linux environment. We also use Docker containers to distribute developer tools so developers can use the tools on any platform as long as they install Docker.

## Prerequisites
- [Docker](https://docs.docker.com/engine/install/)

## Docker build
Docker image containing cross-platform cluster management scripts.

### Local build
```
cd docker
docker build -t evernodedev/hpdevkit .
```

### Push to Docker hub
```
docker push evernodedev/hpdevkit
```

### Run
```
docker run -it --rm --mount type=bind,src=/var/run/docker.sock,dst=/var/run/docker.sock evernodedev/hpdevkit cluster create 2
```

## Windows build
Contains windows launcher scripts. Written using powershell and compiled to exe using [ps2exe](https://github.com/MScholtes/PS2EXE).

### Prerequisites
```powershell
Install-Module ps2exe
```

### Powershell script usage
```powershell
# Deploy contract to single-node cluster.
.\hpdevkit.ps1 deploy <contract files directory>

# Stop and cleanup everything (required for changing cluster size)
.\hpdevkit.ps1 clean

# Use different cluster size.
$env:HP_CLUSTER_SIZE = 3
.\hpdevkit.ps1 deploy <contract files directory>

# Look at specific node's logs.
.\hpdevkit.ps1 logs <node number>

# Start/stop all nodes.
.\hpdevkit.ps1 start
.\hpdevkit.ps1 stop

# Start/stop specific node.
.\hpdevkit.ps1 start <node number>
.\hpdevkit.ps1 stop <node number>
```

If the contract files directory also contains a file named `hp.cfg.override`, it will be used to override the hp.cfg of all nodes. This can be used to set contract specific parameters like 'bin_path' and 'bin_args'

Example `hp.cfg.override` for a nodejs application:
```
{
    "contract": {
        "bin_path": "/usr/bin/node",
        "bin_args": "app.js"
    }
}
```

#### Code generator
```
# Generate nodejs starter project
.\hpdevkit.ps1 gen nodejs starter <project name>
```

### Generate executable
```powershell
cd windows
Invoke-ps2exe .\hpdevkit.ps1 hpdevkit.exe
```
The executable can be distributed to be run as a CLI tool on developer machine.

## Environment variables
| Name | Description | Default value |
| --- | --- | --- |
| HP_CLUSTER | Name of the cluster. Can be used to spin up different clusters for different applications. | `default` |
| HP_CLUSTER_SIZE | Number of nodes in the cluster. Applied with 'deploy' command. | `1` |
| HP_DEFAULT_NODE | The node the 'deploy' command uses to display logs. | `1` |
| HP_DEVKIT_IMAGE | Docker image to be used for devkit cluster management. | `evernodedev/hpdevkit` |
| HP_INSTANCE_IMAGE | Docker image to be used for Hot Pocket instances. | `evernodedev/hotpocket:latest-ubt.20.04-njs.16` |