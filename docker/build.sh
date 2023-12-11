#!/bin/bash

cp ../LICENSE .
docker build -t evernodedev/hpdevkit .
rm LICENSE