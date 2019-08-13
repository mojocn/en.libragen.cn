---
layout: post
title: Ssh tunneling through another ssh to manage SSH account in Golang
category: Golang
tags: Golang
keywords: golang,ssh session,ssh connection,ssh proxy,golang manage ssh account,ssh bash account.
description: how to set up a Ssh connection proxy through another ssh to manage SSH account in Golang
coverage: ssh_proxy.jpg
---

## Background
The tunneling protocol allows a network user to access or provide a network service that the underlying network does not support or provide directly.

There is a problem of how to manage a private cloud cluster of servers by SSH in my work.
Anyway there is a bunch of libraries and frameworks of tunneling SSH connection in Python.
But My project was built in the Golang, Go is quite a new language and not good at DevOps areas. 
As a gopher I do not submit to Python for its rich ecosystem. 
I decided to build my own SSH-SSH-proxy-bridge `util`.

## Coding

### 1.create your `ssh.ClientConfig` with `golang.org/x/crypto/ssh`


```go
import (
	"errors"
	"fmt"
	"golang.org/x/crypto/ssh"
	"time"
)
func NewSshConfig(sshUser, sshPassword, sshType, sshKey, sshKeyPassword string) (config *ssh.ClientConfig, err error) {
	if sshUser == "" {
		return nil, errors.New("ssh_user can't be empty")
	}
	config = &ssh.ClientConfig{
		Timeout:         time.Second * 3,
		User:            sshUser,
		HostKeyCallback: ssh.InsecureIgnoreHostKey(), // ignore host key check
	}
	switch sshType {
	case "password":
		config.Auth = []ssh.AuthMethod{ssh.Password(sshPassword)}
	case "key":
		config.Auth = []ssh.AuthMethod{publicKeyAuthFunc([]byte(sshKey), []byte(sshKeyPassword))}
	default:
		return nil, fmt.Errorf("unknow ssh auth type:%s", sshType)
	}
	return
}
```

### 2. create ssh-tunnel-ssh connection in Golang

In this section I will demonstrate how to manage Linux machines SSH account by Golang.
You must be familiar with Linux bash/shell commands about SSH and append/replace file content.
The following code you may have to trim to fit your project.


```go
func CreateSshProxySshSession(targetSshConfig, proxySshConfig *ssh.ClientConfig, targetAddr, proxyAddr string) (client *ssh.Client, err error) {
	proxyClient, err := ssh.Dial("tcp", proxyAddr, proxySshConfig)
	if err != nil {
		return
	}
	conn, err := proxyClient.Dial("tcp", targetAddr)
	if err != nil {
		return
	}
	ncc, chans, reqs, err := ssh.NewClientConn(conn, targetAddr, targetSshConfig)
	if err != nil {
		return
	}
	client = ssh.NewClient(ncc, chans, reqs)
	return
}
```

### 3. Create ssh-tuntel-ssh instance in project
After the two procedure you can get a `ssh.Client` and use it just like as `golang.org/x/crypto/ssh` examples.
First you create `proxySshClientConfig` and `targetSshClientConfig` separately
The following codes are pasted from my working project, you may have to modify they to adapt to your codebase.

```go
func CreateSshProxySshClient(proxy targe Machine)(c *ssh.Client,err error){
    proxyConfig, err := NewSshConfig(proxy.SshUser, proxy.SshPassword, proxy.SshType, proxy.SshKey, proxy.SshKeyPassword)
    if err != nil {
        return nil, fmt.Errorf("proxy ssh config failed:%s", err)
    }
    targetConfig, err := NewSshConfig(targe.SshUser, targe.SshPassword, targe.SshType, targe.SshKey, targe.SshKeyPassword)
    if err != nil {
        return nil, fmt.Errorf("targe ssh config failed:%s", err)
    }
    targetAddr := fmt.Sprintf("%s:%d", m.SshIp, m.SshPort)
    proxyAddr := fmt.Sprintf("%s:%d", cj.SshAddr, cj.SshPort)
    c, err = CreateSshProxySshSession(targetConfig, proxyConfig, targetAddr, proxyAddr)
    if err != nil {
        return nil, fmt.Errorf("create cluster jumper proxy ssh client failed:%s", err)
    }
    return 
}
```

### 4. Executing commands in private cloud cluster

```go
func runCmd(command string) (string, error) {
	sshClient,err := CreateSshProxySshClient(proxy,target Machine)
	session, err := sshClient.NewSession()
	if err != nil {
		return "", err
	}
	defer session.Close()
	var buf bytes.Buffer
	session.Stdout = &buf
	err = session.Run(command)
	logString := buf.String()
	logrus.WithField("CMD:", command).Info(logString)
	if err != nil {
		return logString, fmt.Errorf("CMD: %s  OUT: %s  ERR: %s,Check your target ssh account has the sudo NOPASSWD right", command, logString, err)
	}
	return logString, nil
}


//CheckSshAccountExist 
func (msa *LogicMachineSshAccount) CheckSshAccountExist() error {
	cmd := fmt.Sprintf("sudo id -u '%s'", msa.sshUser)
	_, err := runCmd(cmd)
	return err
}

//LockSshAccount 
func (msa *LogicMachineSshAccount) LockSshAccount() error {
	cmd := fmt.Sprintf("sudo usermod -L '%s' || true", msa.sshUser)
	_, err := runCmd(cmd)
	return err
}

//UnlockSshAccount 
func (msa *LogicMachineSshAccount) UnlockSshAccount() error {
	cmd := fmt.Sprintf("sudo usermod -U '%s' || true", msa.sshUser)
	_, err := runCmd(cmd)
	return err
}

//ChangePassword 
func (msa *LogicMachineSshAccount) ChangePassword() error {
	cmd := fmt.Sprintf("echo '%s:%s' | sudo chpasswd", msa.sshUser, msa.sshPassword)
	_, err := runCmd(cmd)
	return err
}

//RemoveSudo 
func (msa *LogicMachineSshAccount) RemoveSudo() error {
	//清楚 /etc/sudoers 文件中 用户名信息
	cmd := fmt.Sprintf(`sudo sed -i '/^%s\b/d' /etc/sudoers`, msa.sshUser)
	_, err := runCmd(cmd)
	return err
}

//RemoveSshAccountHard 
func (msa *LogicMachineSshAccount) RemoveSshAccountHard() error {
	//清楚 /etc/sudoers 文件中 用户名信息
	cmd := fmt.Sprintf(`sudo userdel -r -f -Z '%s'`, msa.sshUser)
	_, err := runCmd(cmd)
	return err
}



//RemoveSudo 
func (msa *LogicMachineSshAccount) AddSudo(isNoPassword bool) error {
	var cmd string
	//https://stackoverflow.com/questions/20895619/why-cant-i-echo-contents-into-a-new-file-as-sudo
	if isNoPassword {
		cmd = fmt.Sprintf(`sudo bash -c "echo '%s   ALL=(ALL) NOPASSWD:ALL' >> /etc/sudoers;"`, msa.sshUser)
	} else {
		cmd = fmt.Sprintf(`sudo bash -c "echo '%s   ALL=(ALL) ALL' >> /etc/sudoers;"`, msa.sshUser)
	}
	_, err := runCmd(cmd)
	return err
}

//CreateSshUser 
func (msa *LogicMachineSshAccount) CreateSshUser() error {
	cmd := fmt.Sprintf("sudo useradd -m '%s'", msa.sshUser)
	_, err := runCmd(cmd)
	return err
}

```

### Referer

- [why-cant-i-echo-contents-into-a-new-file-as-sudo](https://stackoverflow.com/questions/20895619/why-cant-i-echo-contents-into-a-new-file-as-sudo)
- [golang.org/x/crypto/ssh](https://golang.org/x/crypto/ssh)
- [libragen/felix](https://github.com/libragen/felix)