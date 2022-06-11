# Hot Pocket developer toolkit
Developer toolkit for Hot Pocket smart contract development. This toolkit makes use of Docker to provide a cross-platform development tools for developers.

We use Docker containers to run Hot Pocket and smart contracts in a Linux environment. We also use Docker containers distributing developer tools so developers can use the tools on any platform as long as they install Docker.

## Docker
Contains the docker image source files for cross-platform dev tools.

### Local build
```
cd docker
docker build -t hpdevkit .
```

### Run
```
docker run -it --rm --mount type=bind,src=/var/run/docker.sock,dst=/var/run/docker.sock hpdevkit cluster create 2
```

## Windows
Contains windows launcher scripts. Written using powershell and combiled to exe using [ps2exe](https://github.com/MScholtes/PS2EXE).

## Prerequisites
```powershell
Install-Module ps2exe
```

### Generate exe
```powershell
cd windows
Invoke-ps2exe .\hpdevkit.ps1 hpdevkit.exe
```
