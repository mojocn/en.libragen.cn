---
layout: post
title: Build a web spider with golang
category: Golang
tags: Golang
keywords: Build a web spider with golang,cobra,sqlite,viper
description: Build a web spider with golang,cobra,sqlite,viper
coverage: golang_spider.jpg
---


In the article you will learn the skill of parsing a HMTL page into a markdown format file for Github Pages to generate a Website.
I will name the golang application `felix`.

## Skills your need

- [`CSS` selector grammar](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Selectors), [`xpath`(XML Path Language)](https://developer.mozilla.org/en-US/docs/Web/XPath)
- [goquery package](https://developer.mozilla.org/en-US/docs/Web/XPath)
- [golang Standard Package `text/template`](https://golang.org/pkg/text/template/)
- Some SQL knowledge of database and the package of [GORM](https://gorm.io/)
- Golang CLI package [`spf13`](https://github.com/spf13/cobra)

## 1.Getting Started

I would like to use SQLite3 as my crawler's database for it is a small, slim and suitable database for standalone application without external dependency.
Using `spf13/cobra` package is for it is a well documented library and binds flags and arguments so much easier than the standard library `flag`. 

### 1.1 Start with `spf13/cobra`
While you are welcome to provide your own organization, typically a Cobra-based application will follow the following organizational structure:
```bash
  ▾ appName/
    ▾ cmd/
        add.go
        your.go
        commands.go
        here.go
      main.go
```

In a Cobra app, typically the main.go file is very bare. It serves one purpose: initializing Cobra.
```go
package main

import (
  "{pathToYourApp}/cmd"
)

func main() {
  cmd.Execute()
}
```

### 1.2 `cmd/root.go` `initFunc`
the felix project' `main.go`'s `main` function is the entrance of the application.
All command are added by `cmd/root.go` `func Execute(bTime, gHash string)`,
and before all command executed there is a `cobra.OnInitialize(initFunc)` callback function which will be called firstly.
You can do stuff like loading configuration, connecting to database,initialization your logger, create/migrate your SQLite database and etc in the `iniFunc`.

the [`cmd/root.go`](https://github.com/libragen/felix) file looks like this
```go
package cmd

import (
	"fmt"
	"os"
	"runtime"
	"github.com/johntdyer/slackrus"
	"github.com/dejavuzhou/felix/models"
	"github.com/sirupsen/logrus"
	"github.com/spf13/cobra"
	"github.com/spf13/viper"
)

// rootCmd represents the base command when called without any subcommands
var rootCmd = &cobra.Command{
	Use:   "felix",
	Short: "",
	Long:  ``,
	Run: func(cmd *cobra.Command, args []string) {
		if isShowVersion {
			fmt.Println("Golang Env: %s %s/%s", runtime.Version(), runtime.GOOS, runtime.GOARCH)
			fmt.Println("UTC build time:%s", buildTime)
			fmt.Println("Build from Github repo version: https://github.com/libragen/felix/commit/%s", gitHash)
		}

	},
}

// Execute adds all child commands to the root command and sets flags appropriately.
// This is called by main.main(). It only needs to happen once to the rootCmd.
func Execute(bTime, gHash string) {
	buildTime = bTime
	gitHash = gHash
	if err := rootCmd.Execute(); err != nil {
		fmt.Println(err)
		os.Exit(1)
	}
}

var buildTime, gitHash string
var verbose, isShowVersion bool

func init() {
	cobra.OnInitialize(initFunc)
	rootCmd.Flags().BoolVarP(&isShowVersion, "version", "V", false, "show binary build information")
	rootCmd.PersistentFlags().BoolVar(&verbose, "verbose", false, "verbose")
}

func initFunc() {
	//load configuration file
	initViper()
	//create SQLite3 database file if not exist or load SQLite3 databse from disk
	models.CreateSqliteDB(verbose)
	initSlackLogrus()
}
//setup your logger with logrus and slackurs HOOK
func initSlackLogrus() {
	lvl := logrus.InfoLevel
	//init logrus as global logger
	logrus.SetLevel(lvl)
	logrus.SetFormatter(&logrus.JSONFormatter{TimestampFormat: "06-01-02T15:04:05", PrettyPrint: true})
	logrus.SetReportCaller(true)
	mySlackApi := viper.GetString("felix.slack")
	logrus.AddHook(&slackrus.SlackrusHook{
		HookURL:        mySlackApi,
		AcceptedLevels: slackrus.LevelThreshold(logrus.ErrorLevel),
		Channel:        "#Felix",
		IconEmoji:      ":ghost:",
		Username:       "Felix",
	})

}
//init viper to load configuration toml file
func initViper() {
	viper.SetConfigName("config")       // name of config file (without extension)
	viper.AddConfigPath(".")            // optionally look for config in the working directory
	viper.AddConfigPath("/etc/felix/")  // path to look for the config file in
	viper.AddConfigPath("$HOME/.felix") // call multiple times to add many search paths
	err := viper.ReadInConfig()         // Find and read the config file
	if err != nil {                     // Handle errors reading the config file
		logrus.Fatalf("Fatal error config file: %s \n", err)
	}
}
```

## 2.Work flow of spider command 

When you input `felix spiderHN` into your terminal, the following process will be executed.

1. `Cobra` executes all its `init` functions in `cmd` package and `initFunc` is registered by `cobra.OnInitialize` in `cmd/root.go`'s `init`function.
2. After `init` is done, callback function `initFunc` is executed ,loading config by viper, loading/creating/migrating SQLite3 database, initialization `Logrus` as logger.
3. `cmd/jekyll_spider_hn.go`'s `Run: func(cmd *cobra.Command, args []string)` called.
4. Crawler downloads hacknews-new HTML page and parses its items into database by ` spiderhn.SpiderHackNews()`.
5. Crawler downloads hacknews-show HTML page and parses its items into databse by `spiderhn.SpiderHackShows()`.
6. Fetch hacknews items from database by day and render the items into a markdown file.
7. Call git command by golang `exec.Command` push the markdown file to github.com repo.
8. Github acknowledged the push, run Jekyll Page builder and parse the markdown files into website pages.

[cmd/jekyll_spider_hn.go](https://github.com/libragen/felix/blob/master/cmd/jekyll_spider_hn.go)
```go
package cmd

import (
	"time"

	"github.com/dejavuzhou/felix/spiderhn"
	"github.com/sirupsen/logrus"
	"github.com/spf13/cobra"
)

// spiderHNCmd represents the spiderHN command
var spiderHNCmd = &cobra.Command{
	Use:   "spiderHN",
	Short: "tech.mojotv.cn: spider hacknews",
	Long:  ``,
	Run: func(cmd *cobra.Command, args []string) {
		techMojoSpiderHN()
	},
}

func init() {
	rootCmd.AddCommand(spiderHNCmd)
}

var gitCount = 1

func createCmds() []spiderhn.Cmd {
	gitCount++
	gifConfig1 := []spiderhn.Cmd{
		{"git", []string{"config", "--global", "user.email", "'xx@qq.com'"}},
	}
	gifConfig2 := []spiderhn.Cmd{
		{"git", []string{"config", "--global", "user.email", "'xx@qq.com'"}},
	}
	cmds := []spiderhn.Cmd{
		{"git", []string{"config", "--global", "user.name", "'EricZhou'"}},
		{"git", []string{"stash"}},
		{"git", []string{"pull", "origin", "master"}},
		{"git", []string{"stash", "apply"}},
		{"git", []string{"add", "."}},
		{"git", []string{"status"}},
		{"git", []string{"commit", "-am", "hacknews-update" + time.Now().Format(time.RFC3339)}},
		{"git", []string{"status"}},
		{"git", []string{"push", "origin", "master"}},
		//{"netstat", []string{"-lntp"}},
		//{"free", []string{"-m"}},
		//{"ps", []string{"aux"}},
	}
	//switch github.com account
	if gitCount%2 == 0 {
		cmds = append(gifConfig2, cmds...)
	} else {
		cmds = append(gifConfig1, cmds...)
	}
	return cmds
}

func techMojoSpiderHN() {
	if err := spiderhn.SpiderHackNews(); err != nil {
		logrus.Error(err)
	}
	if err := spiderhn.SpiderHackShows(); err != nil {
		logrus.Error(err)
	}
	if err := spiderhn.ParsemarkdownHacknews(); err != nil {
		logrus.Error(err)
	}
}
```


## 3.Download hacknews web page and Insert them into database

There are 3 procedures of crawler the hacknews pages.

### 3.1 Download HTML page
First you have to inspect the target web page in your Chrome browser under the settings of Javascript is blocked.
![](/assets/image/browser_js_disabled.png)

Then you can make sure the target page is an old school web page and it is suitable for using `XML/Xpath` method to crawl.
Otherwise you have to use [`chromedp`](https://github.com/chromedp/chromedp)/[`phlantomjs`](https://github.com/benbjohnson/phantomjs) library to parse the web page.

#### Download web page and new `goquery.Document`
Set the header and cookie to avoid being caught by crawler blocker
```go
func downloadHtml(url string) (*goquery.Document, error) {
	client := &http.Client{}
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	//set cookie
	req.Header.Set("cookie", viper.GetString("spiderhn.cookie"))
	//set user agent
	req.Header.Set("User-Agent", viper.GetString("spiderhn.userAgent"))
	res, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	if res.StatusCode != 200 {
		return nil, errors.New("the get request's response code is not 200")
	}
	defer res.Body.Close()
	//new goquery.NewDocumnet
	return goquery.NewDocumentFromReader(res.Body)
}

```

### 3.2  Use Goquery to get items
Find all news links in web page then insert/update them in database.

```go
func SpiderHackNews() error {
	//download web page
	doc, err := downloadHtml(hackNewsUrl)
	if err != nil {
		return err
	}
	//find all link tag then 
	doc.Find("a.storylink").Each(func(i int, s *goquery.Selection) {
		url, _ := s.Attr("href")
		//get the English Title of the item
		titleEn := s.Text()
		newsItem := models.HackNew{TitleEn: titleEn, Url: url, Cate: "hacknews"}
				err = newsItem.CreateOrUpdate()
		if err != nil {
			logrus.WithError(err).Error("goquery Each save news to db failed")
		}
	})
	return nil
}
```

### 3.3 #### Translate the English news title into Chinese by Translation API and update or insert the news item in database

I used a paid Chinese translation API to get the Chinese title of the link.
Calling the translation API is purely combine the API document, appKey and appSecret with golang `http/net Client` package.
The API document is [](http://ai.youdao.com/docs/doc-trans-api.s#p04)
there is the code of calling the translation API. 

```go
func generateSign(appKey, q, salt, curTime, appSecret string) string {
	input := ""
	a := []rune(q)
	inputLen := len(a)
	if inputLen < 20 {
		input = string(a)
	} else {
		input = fmt.Sprintf("%s%d%s", string(a[:10]), inputLen, string(a[inputLen-10:]))
	}
	temp := appKey + input + salt + curTime + appSecret
	sum := sha256.Sum256([]byte(temp))
	return fmt.Sprintf("%x", sum)
}
func TranslateEn2Ch(text string) (string, error) {
	res, err := youdaoTranslateApi(text, "EN", "zh-CHS")
	if err != nil {
		return "", err
	}
	if len(res.Translation) > 0 {
		return res.Translation[0], nil
	}
	return "", nil
}

func youdaoTranslateApi(q, from, to string) (obj *respObj, err error) {
	salt := fmt.Sprintf("%d", rand.Intn(99999))
	appKey := viper.GetString("spiderhn.youdaoAppKey")
	appSecret := viper.GetString("spiderhn.youdaoAppSecret")
	appHost := viper.GetString("spiderhn.youdaoAppHost")
	ts := fmt.Sprintf("%d", time.Now().Unix())
	sign := generateSign(appKey, q, salt, ts, appSecret)
	data := url.Values{
		"q":        {q},
		"to":       {to},
		"from":     {from},
		"appKey":   {appKey},
		"salt":     {salt},
		"sign":     {sign},
		"curtime":  {ts},
		"signType": {"v3"},
	}
	resp, err := http.PostForm(appHost, data)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if err != nil {
		return nil, err
	}

	obj = &respObj{}
	err = json.NewDecoder(resp.Body).Decode(obj)
	if err != nil {
		return nil, err
	}
	if obj.HasError() {
		return nil, fmt.Errorf("http error code:%s", obj.ErrorCode)
	}
	time.Sleep(time.Millisecond * 100)
	return obj, nil
}
```

### 3.4 #### Update Or Insert the item into SQLite3 database
First I check the item's url whether is valid. 
Then check the item whether exists in database by url.
If it exists and has no Chinese Title, call the translate api to get the Chinese title and update it.
Otherwise create a row with the translated Chinese title in database.

```go
func (m *HackNew) CreateOrUpdate() (err error) {
	_, err = url.Parse(m.Url)
	if err != nil {
		return err
	}
	row := HackNew{}
	if db.Where("url = ?", m.Url).First(&row).RecordNotFound() {
		err = m.translateEn2ch()
		if err != nil {
			logrus.WithError(err).WithField("en", m.TitleEn).Error("HackNew.CreateOrUpdate translation failed")
		}
		return db.Create(m).Error
	}
	if row.TitleZh == "" {
		err = m.translateEn2ch()
		if err != nil {
			logrus.WithError(err).WithField("en", m.TitleEn).Error("HackNew.CreateOrUpdate translation failed")
		}
	}
	return db.Model(row).Where("url = ?", m.Url).Updates(*m).Error
}
```


## 4.Render Hacknews item into markdown file by day
Output a markdown format file needs you fetch Hacknews items from database by day,
parse the list into file with the help of `text/template` and a const string template.

### 4.1 Fetch Hacknews items from SQLite3 database
Use `GORM` library get news items by query of day.

```go
type HackNew struct {
	BaseModel
	TitleZh string `json:"title_zh"`
	TitleEn string `json:"title_en"`
	Url     string `gorm:"index" json:"url"`
	Cate    string `json:"cate" comment:"news or show"`
}

func (m HackNew) TodayRowBy(cate string) (list []HackNew, err error) {
	list = []HackNew{}
	today := time.Now().Format("2006-01-02")
	err = db.Model(m).Where("date(`updated_at`) = ? AND `cate` = ?", today, cate).Find(&list).Error
	return
}
```
### 4.2 Render news items into file
Fetch hackshows and hacknews items list from database.
Restore backQuote to avoid markdown backQuote char disturbing with golang' multi line identifier char.
Create or open markdown file then use `text/template ` render hacknews items into it.

[https://github.com/libragen/felix/blob/master/spiderhn/hacknews.go](https://github.com/libragen/felix/blob/master/spiderhn/hacknews.go)

```go

func ParsemarkdownHacknews() error {
	mdl := models.HackNew{}
	newsItems, err := mdl.TodayRowBy("hacknews")
	if err != nil {
		return err
	}
	showItems, err := mdl.TodayRowBy("hackshows")
	if err != nil {
		return err
	}
	if len(newsItems) < 1 {
		return nil
	}

	techMojotvCnSrcDir := viper.GetString("tech_mojotv_cn.srcDir")
    // restore ` with const backQuote to avoid markdown ` disturb with golang `
	tplString := strings.Replace(jekyllMarkdownTemplate, backQuote, "`", -1)
	tmpl, err := template.New("awesome").Parse(tplString)
	if err != nil {
		return err
	}
	day := time.Now().Format("2006-01-02")
	mdFile := fmt.Sprintf("%s-hacknews.md", day)
	mdFilePath := filepath.Join(techMojotvCnSrcDir, "_posts", "hacknews", mdFile)
	mdFile = filepath.Clean(mdFilePath)
	file, err := os.Create(mdFilePath)
	if err != nil {
		return err
	}
	defer file.Close()

	data := struct {
		Day   string
		News  []models.HackNew
		Shows []models.HackNew
	}{day, newsItems, showItems}
	err = tmpl.Execute(file, data) //
	return err
}
```


## Source Code [libragen/felix](https://github.com/libragen/felix)
Felix  is a CLI util kit repo for myself, feel free you fork and modify for yourself.
