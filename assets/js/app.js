// Add a request interceptor
axios.interceptors.request.use(function (config) {
    // Do something before request is sent
    NProgress.start();
    return config;
}, function (error) {
    NProgress.done();
    // Do something with request error
    return Promise.reject(error);
});

// Add a response interceptor
axios.interceptors.response.use(function (response) {
    NProgress.done();
    return response;
}, function (error) {
    NProgress.done();
    return Promise.reject(error);
});

var apiHttp = axios.create({
    baseURL: commentHost,
    timeout: 1000,
});

function noteError(m) {
    app.$notify({type: "danger", title: "error", msg: m, iconClass: "fa fa-bomb"})
}

function noteSuccess(m) {
    app.$notify({type: "success", title: "OK", msg: m, iconClass: "fa fa-bomb"})
}

apiHttp.interceptors.response.use(function (response) {
    // Do something with response data
    NProgress.done();
    if (response.status === 200 && response.data && !response.data.ok) {
        //显示登陆页面
        var msg = response.data.msg;
        noteError(msg)
        return null
    }

    return response.data;
}, function (error) {
    NProgress.done();
    if (error.response && error.response.status === 412) {
        noteError("请登陆")
        var p = window.location.pathname
        window.location.href = "/login?re=" + p;
        return
    }
    if (error.message) {
        noteError(error.message)

        return
    }
    return null;
});

var app = new Vue({
    components: {
        'avatar': VueAvatar.Avatar,
    },
    el: '#app',
    data: {
        isMobile: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
        articleTitle: '',
        articleUrl: '',
        pjaxHtml: '',
        categories: null,
        articles: null,
        all: null,
        commentInput: "",
        commentList: [],
        search: "",
        clickedCate: "",
        showPostList: false,
        reply_parent_path: '',
        commentCount: 0,
    },
    computed: {
        apiC: function () {
            apiHttp.defaults.headers.common['Authorization'] = 'Bearer ' + localStorage.getItem("_k");
            return apiHttp;
        },
        isPostPage: function () {
            var flag = (window.location.pathname !== '/' && window.location.pathname !== '/404');
            return flag;
        },
        uid: function () {
            var uid = localStorage.getItem("uid") || "1";
            return parseInt(uid)
        },
        username: function () {
            var user = localStorage.getItem("username") || "FelixZhou";
            return user;
        },
        thisUrl: function () {
            return window.location.hostname + window.location.pathname;
        },

    },
    watch: {
        commentInput: function (val) {
            if (!val) {
                this.reply_parent_path = '';
            }
        },
        search: function (val) {
            if (val === '') {
                this.articles = this.all
                return
            }
            this.articles = this.all.filter(post => {
                var title = post.title.toUpperCase();
                var cp = val.toUpperCase();
                return title.indexOf(cp) !== -1
            });
        },
    },
    updated: function () {

        var meta = (document.getElementsByClassName('article-meta'))[0];
        var indexDom = document.getElementById('article-index-ul')
        if (!indexDom) {
            return
        }
        var path = window.location.pathname;
        if (path === '/404' || path === '/') {
            meta.style.visibility = 'hidden'
            indexDom.style.visibility = 'hidden'
        } else {
            this.createMarkdownIndex()
            meta.style.visibility = 'visible'
            indexDom.style.visibility = 'visible'
        }

    },
    created: function () {
        this.showPostList = window.location.pathname === '/';
        var vm = this;
        window.onpopstate = function (e) {
            var state = e.state;
            if (state !== null) {
                document.title = state.title;
                vm.doView(state)
            } else {
                document.title = window.location.hostname;
            }
        };
    },
    mounted: function () {
        var vm = this
        axios.get('/api/article-list.json').then(function (response) {
            vm.categories = response.data.categories;
            vm.articles = response.data.articles;
            vm.all = response.data.articles;
        }).catch(function (error) {
            console.log(error);
        });
        this.fetchComment(null);
        this.updateGoogleAds();
    },
    methods: {
        updateGoogleAds() {
            (adsbygoogle = window.adsbygoogle || []).push({})
        },
        arrayCount: function (arrayUid) {
            if (!Array.isArray(arrayUid)) {
                return 0
            }
            return arrayUid.length;
        },
        isUidInArray: function (arrayUid) {
            if (!Array.isArray(arrayUid)) {
                return false
            }
            var uid = this.uid;
            for (var i = 0; i < arrayUid.length; i++) {
                if (parseInt(arrayUid[i]) === uid) {
                    return true
                }
            }
            return false;
        },
        fetchComment: function (url) {
            if (!url) {
                url = this.thisUrl;
            }
            var data = {page: 1, size: 99999, page_url: url};
            var vm = this;
            this.apiC.get('api/comment', {params: data}).then(function (res) {
                if (res) {
                    vm.commentList = res.data;
                    vm.commentCount = res.total;
                }
            })
        },
        doView: function (item) {
            var url = item.url;
            var title = item.title;
            history.pushState({
                url: url,
                title: title
            }, title, url);
            document.title = title;
            var vm = this;
            axios.get(url).then(function (res) {
                var parts = res.data.trim().split("<!--===thisExplodePointPjax===-->")
                vm.pjaxHtml = parts[1];
                vm.fetchComment(window.location.hostname + url);
                vm.updateGoogleAds();
            }).catch(function (error) {
                vm.pjaxHtml = '';
                console.log(error);
            });
        },
        doSetPostList: function (val) {
            if (val) {
                this.$refs.search.focus()
            } else {
                this.$refs.search.blur()
            }
            this.$refs.search.focus()
            this.showPostList = val;
        },
        createMarkdownIndex: function () {
            if (this.isMobile) {
                return;
            }
            var pathName = window.location.pathname;
            //设置右侧文章内容idx
            if (pathName === '/404' || pathName === '/') {
                return
            }
            var indexDom = document.getElementById('article-index-ul')
            var tocHtml = '';
            var h2ds = document.querySelectorAll("h2,h3")
            for (var i = 0; i < h2ds.length; i++) {
                var h2d = h2ds[i];
                var someHash = this.randomString();
                h2d.setAttribute('id', someHash)
                if (h2d.tagName === "H2") {
                    tocHtml += '<li class="article-index-li article-index-h2"><i class="fa fa-line-chart"></i> <a href="#' + someHash + '" class="js-anchor-link">' + h2d.innerText + '</a></li>';
                } else {
                    tocHtml += '<li class="article-index-li article-index-h3"><i class="fa fa-superpowers"></i> <a href="#' + someHash + '" class="js-anchor-link">' + h2d.innerText + '</a></li>';
                }
            }
            indexDom.innerHTML = tocHtml
        },
        doChangeCate: function (val) {
            this.showPostList = true;
            this.$refs.search.focus()
            this.search = '';
            this.clickedCate = val;
            if (val === "") {
                this.articles = this.all
                return
            }
            this.articles = this.all.filter(post => post.cate.toUpperCase() === val.toUpperCase());
        },
        randomString: function () {
            var ID = "",
                alphabet = "abcdefghijklmnopqrstuvwxyz";

            for (var i = 0; i < 5; i++) {
                ID += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
            }
            return ID;
        },
        doCommentReply: function (obj) {
            var atUser = obj.user.username;
            this.commentInput = "@" + atUser + " ";
            this.reply_parent_path = obj.parent_path + '/' + obj.ID;
            this.$refs.commenter.scrollIntoView();

        },
        doCommentAdd: function () {
            var url = this.thisUrl;
            var data = {page_url: url, content: this.commentInput, parent_path: this.reply_parent_path}
            var vm = this;
            this.apiC.post('api/comment', data).then(function (res) {
                if (res) {
                    vm.commentInput = '';
                    vm.reply_parent_path = '';
                    noteSuccess('添加评论成功')
                    vm.fetchComment(null);
                }
            })
        },
        doCommentAction: function (obj, action) {
            var url = "api/comment/" + obj.ID + "/" + action;
            var vm = this;
            this.apiC.get(url).then(function (res) {
                if (res) {
                    noteSuccess(action + "操作成功")
                    vm.fetchComment(null);
                }
            })
        },
        doClear: function () {
            this.commentInput = "";
        },
        humanTime: function (timeS) {
            var date = new Date(timeS);
            var delta = Math.round((+new Date - date) / 1000);
            var minute = 60;
            var hour = minute * 60;
            var day = hour * 24;
            var week = day * 7;
            var mm = day * 31;
            var fuzzy;
            if (delta < 30) {
                fuzzy = '现在';
            } else if (delta < minute) {
                fuzzy = delta + ' 秒前';
            } else if (delta < 2 * minute) {
                fuzzy = '一分钟前'
            } else if (delta < hour) {
                fuzzy = Math.floor(delta / minute) + '分钟前';
            } else if (Math.floor(delta / hour) == 1) {
                fuzzy = '一小时前'
            } else if (delta < day) {
                fuzzy = Math.floor(delta / hour) + ' 小时前';
            } else if (delta < day * 2) {
                fuzzy = '昨天';
            } else if (delta < week) {
                fuzzy = Math.floor(delta / day) + ' 天前';
            } else if (delta < mm) {
                fuzzy = Math.floor(delta / week) + ' 周前';
            } else {
                fuzzy = date.toISOString().slice(2, 10).replace('T', ' ')

            }
            return fuzzy
        }
    }
});
