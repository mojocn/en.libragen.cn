package main

import "libragen/cmd"

var buildTime, gitHash string

func main() {
	cmd.Execute(buildTime, gitHash)
}
