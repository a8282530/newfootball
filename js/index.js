document.addEventListener('alpine:init', () => {
    const host = 'g5aa4c10.ala.cn-hangzhou.emqxsl.cn:8084/mqtt';
    const config = {
        username: 'user',
        password: 'user123',
        protocolVersion: 5, // mqtt协议版本
        keepalive: 60, // 心跳间隔
        clean: true, // 连接时是否清除会话
        reconnectPeriod: 1000, // 1秒重连一次
        connectTimeout: 10000, // 连接超时时间
        properties: {
            sessionExpiryInterval: 3600, // 会话过期时间/秒
        }
    }
    const Toast = Swal.mixin({
        toast: true,
        position: "center",
        showConfirmButton: false,
        timer: 1500,
        timerProgressBar: true,
        didOpen: (toast) => {
            // toast.onmouseenter = Swal.stopTimer;
            toast.onmouseleave = Swal.resumeTimer;
        }
    });
    function getChangedItems(oldArr, newArr) {
        // 用唯一标识（比如 starttime+hometeam+awayteam）做映射
        function makeKey(item) {
            return `${item.hometeam}_${item.awayteam}_${item.rec}`;
        }

        // 先把 oldArr 转成字典，方便查找
        const oldMap = {};
        oldArr.forEach(item => {
            oldMap[makeKey(item)] = item;
        });

        // 检查 newArr 中每个对象
        const changed = [];
        newArr.forEach(item => {
            const key = makeKey(item);
            const oldItem = oldMap[key];
            // 如果 oldItem 不存在，或者三字段有一个不同，就取出
            if (
                !oldItem ||
                item.hometeam !== oldItem.hometeam ||
                item.rec !== oldItem.rec ||
                item.awayteam !== oldItem.awayteam
            ) {
                changed.push(item);
            }
        });
        return changed;
    };
    document.addEventListener('contextmenu', function (e) {
        e.preventDefault();
    });
    document.addEventListener('click', e => {
        // 播放一个静音的音频来解锁
        console.log('解锁音频');
        // this.playsound('0');
        const audio = new Audio();
        audio.play()
            .then(() => {
                console.log('音频解锁成功');
            })
            .catch(err => {
                console.error('无法解锁音频:', err);
            });
    });

    async function sleep(time) {
        return new Promise(resolve => {
            setTimeout(resolve, time);
        });
    };
    window.playsound = async function (name) {
        const audio = document.querySelector(`audio[name="${name}"]`);
        return audio && await audio.play(),true;
    };

    function formatTimestamp(timestamp, isFull = true) {
        // 1. 判断时间戳单位，如果是秒级（10位），则乘以1000转为毫秒
        if (timestamp.toString().length === 10) {
            timestamp *= 1000;
        }

        const date = new Date(timestamp);

        const year = date.getFullYear();
        // getMonth() 返回 0-11，所以需要 +1
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        const seconds = date.getSeconds().toString().padStart(2, '0');

        return isFull ? `${year}-${month}-${day} ${hours}:${minutes}:${seconds}` : `${year}-${month}-${day}`;
    };

    async function setings() {
        let localsetings = localStorage.getItem('setings') || JSON.stringify({
            '1': true,
            '2': true,
            '3': true,
            '4': true,
            '5': true,
        });
        const setings = JSON.parse(localsetings);
        const { value: formValues } = await Swal.fire({
            title: "消息提示设置",
            html: `
                <div class="setings-form">
                    <div>
                        <label>上半场</label>
                        <input type="checkbox" ${setings['1'] ? 'checked' : ''} name="1">
                    </div>
                    <div>
                        <label>全场</label>
                        <input type="checkbox" ${setings['2'] ? 'checked' : ''} name="2">
                    </div>
                    <div>
                        <label>走地</label>
                        <input type="checkbox" ${setings['3'] ? 'checked' : ''} name="3">
                    </div>
                    <div>
                        <label>皇冠上半场</label>
                        <input type="checkbox" ${setings['4'] ? 'checked' : ''} name="4">
                    </div>
                    <div>
                        <label>初盘</label>
                        <input type="checkbox" ${setings['5'] ? 'checked' : ''} name="5">
                    </div>
                </div>
            `,
            focusConfirm: false,
            preConfirm: () => {
                const checkboxs = document.querySelectorAll('.setings-form input[type="checkbox"]');
                let res = Object();
                checkboxs.forEach(checkbox => {
                    res[checkbox.name] = checkbox.checked;
                })
                return res;
            }
        });
        if (formValues) {
            // Swal.fire(JSON.stringify(formValues));
            localStorage.setItem('setings', JSON.stringify(formValues));
            Toast.fire({
                icon: 'info',
                title: '设置已保存'
            });
        }
    };


    Alpine.data('app', () => ({
        isVisible: true,
        unreadmsgList: [],
        client: null,
        isshowToast: false,
        reconnectCount: 0,
        maxReconnectCount: 3,
        card: '',
        toastMsg: '',
        toastisShow: true,
        now_time: formatTimestamp(Date.now()),
        objmsgList: {
            '1': { name: '上半场', data: [] },
            '2': { name: '全场', data: [] },
            '3': { name: '走地', data: [] },
            '4': { name: '皇冠上半场', data: [] },
            '5': { name: '初盘', data: [] },
            '6': { name: '历史', data: [] },
        },
        historyobj: {},
        countstat: {},
        msgindex: '1',
        historyType: '1',
        historyurl: '',
        pageIndex: 1,
        expiry_time: '',
        // 计算动画持续时间的函数
        calculateAnimationDuration() {
            // 估算文本长度 (字符数作为简单估算)
            const textLength = this.toastMsg.length;

            // 基础速度系数
            const baseSpeed = 0.5; // 每字符秒数

            // 计算持续时间 (最小8秒，最大30秒)
            return Math.min(Math.max(textLength * baseSpeed, 8), 30);
        },
        async onDataChange(buffer, card) { // 处理接收到的消息
            try {
                const jsontxt = shiftBytesDecrypt(buffer);
                const { type = '1', value = [] } = JSON.parse(jsontxt);
                // console.log('type:', type, 'value:', value);

                if (type === '7') {
                    this.isVisible = false;
                    this.card = card;
                    this.expiry_time = formatTimestamp(Number(value));
                    return playsound('sort');
                }
                if (type === '0') {
                    let { content, timer } = value;
                    return this.showtoast(content, timer);
                };
                if (type === '6') {
                    this.historyurl = value;
                    return this.history();
                };

                const localitems = localStorage.getItem('setings') || JSON.stringify({
                    '1': true,
                    '2': true,
                    '3': true,
                    '4': true,
                    '5': true,
                }),
                    setings = JSON.parse(localitems);

                try {
                    value.sort((a, b) => a.overtime.localeCompare(b.overtime)).reverse();
                } catch (e) {
                    console.log('sort error:', e);
                }
                if (this.objmsgList[type]?.data?.length > 0) {
                    const changed = getChangedItems(this.objmsgList[type].data, value);
                    changed && changed.length > 0 && changed.some(item => {
                        return this.onMsgChange(type, item);
                    }) && setings[type] && (playsound('message'), this.showMsgList());
                }
                this.objmsgList[type].data = value;
                this.msgindex === type && this.historystat(value);
            } catch (error) {
                console.log('Error onDataChange:', error);
            }

        },
        async historystat(values) {
            let obj = {
                count: 0, // 总次数
                win: 0,  // 赢
                lose: 0, // 输
                draw: 0, // 平
                winrate: 0, // 胜率
            }
            if (!values || values.length < 1) return this.countstat = obj, obj;
            values.map(item => {
                obj.count++;
                item.hit == '❌' && obj.lose++;
                item.hit == '✅' && obj.win++;
                item.hit == '💧' && obj.draw++;
            });
            const winrate = obj.win / obj.count * 100;
            obj.winrate = winrate === Infinity ? `0.00%` : `${winrate.toFixed(2)}%`;
            this.countstat = obj;
            return obj;
        },
        async setings() {
            await setings();
        },
        async systemexit() {
            Swal.fire({
                title: '确定退出系统？',
                icon: 'warning',
                confirmButtonText: '确定退出'
            }).then(({ isConfirmed }) => {
                if (!isConfirmed) {
                    return;
                }
                aardio.close();
            });
        },
        async showtoast(content, timer = 20000) {
            if (timer < 1000) return this.toastisShow = true;
            this.toastisShow = false;
            this.toastMsg = content;
            await sleep(timer);
            this.toastisShow = true;
        },
        async login(title) {
            const { value: card } = await Swal.fire({
                title: title ?? '龙头AI卡密登录',
                width: 400,
                padding: "1em",
                color: "#716add",
                background: "#eee",
                focusConfirm: false,
                confirmButtonText: '登录',
                allowOutsideClick: false,
                input: "text",
                inputValidator: (result) => {
                    return !result && "请输入卡密";
                },
                inputPlaceholder: "请输入卡密"
            });
            if (card) {
                let connected = false;
                this.isVisible = true;
                this.client = mqtt.connect(`wss://${host}`, { clientId: card, ...config });
                this.client.on('connect', evt => {
                    console.log('connected')
                    const intertimeout = setTimeout(() => {
                        clearTimeout(intertimeout);
                        !connected && this.logout('登录超时，请检查网络状态或联系客服！ 或尝试重新登录');
                    }, 8000);
                });
                this.client.on('message', (topic, message, packet) => {
                    // console.log('packet:',packet, topic);
                    connected = true;
                    this.onDataChange(message, card);
                });
                // 监听关闭事件
                this.client.on('close', () => {
                    console.log('连接关闭事件触发');
                });

                // 监听错误事件
                this.client.on('error', (error) => {
                    connected = true;
                    console.log('连接错误:', error);
                });
                this.client.on('disconnect', (packet) => {
                    connected = true;
                    if (packet) {
                        console.log('断开原因:', packet);
                        const { reasonCode } = packet;
                        if (reasonCode === 152) {
                            // 卡密错误
                            return this.logout('卡密错误，请重新登录')
                        }
                        if (reasonCode === 142) {
                            // 已经在其他登录登录
                            return this.logout('卡密已到期,或已在其他地方登录！');
                        }
                        return this.logout(`未知错误 ${reasonCode}，请检查网络或联系客服`);
                    }
                });
                // 监听离线事件
                this.client.on('offline', () => {
                    console.log('客户端离线');
                });
                this.client.on('reconnect', () => {
                    this.reconnectCount++;
                    console.log('正在重连，第', this.reconnectCount, '次');
                    if (this.reconnectCount >= this.maxReconnectCount) {
                        console.log('重连次数已达上限，停止重连');
                    }
                });

            }
        },
        async logout(title) {
            try {
                this.client.end(true, () => {
                    this.isVisible = false;
                    this.reconnectCount = 0;
                    this.msgList = [];
                    this.card = '';
                    this.expiry_time = '';
                })
            } catch (error) {
                console.log('disconnect error:', error)
            }
            this.login(title);
        },
        async showMsgList() {
            this.unreadmsgList.sort((a, b) => a.item.overtime.localeCompare(b.item.overtime)).reverse();
            let html = `<div class="msg-readlist"><div class="msg-header">
                <span>消息时间</span>
                <span>开赛时间</span>
                <span>提示时间</span>
                <span>联赛</span>
                <span>状态</span>
                <span>主队</span>
                <span>比分</span>
                <span>客队</span>
                <span>推荐</span>
                <span>是否命中</span>
            </div><div class="msg-content">`;
            this.unreadmsgList.some(item => {
                let { starttime, prompttime, league, status, hometeam, score, awayteam, rec, hit } = item.item,
                    name = this.objmsgList[item.index].name;
                html += `
                <div class="msg-item">
                    <span title="点击前往赛事详情" onclick="app.msgindex='${item.index}'">
                        <h1 class="nav-link">⬅️ ${name}</h1>
                        <h1>${item.date.slice(5)}</h1>
                    </span>
                    <span>${starttime}</span>
                    <span>${prompttime}</span>
                    <span>${league}</span>
                    <span>${status}</span>
                    <span>${hometeam}</span>
                    <span>${score}</span>
                    <span>${awayteam}</span>
                    <span>${rec || '无'}</span>
                    <span>${hit || '无'}</span>
                    <span title='删除' class="msg-delete" id="${item.key}" onclick="app.removeread(parseInt(this.id)),this.parentNode.parentNode.removeChild(this.parentNode)">🗑️</span>
                </div>
                `;
            });
            html += `</div></div>`;
            app.isshowToast = true;
            Swal.fire({
                title: `📯 未读消息 📯`,
                width: '780px',
                color: "#716add",
                html,
                focusConfirm: false,
                confirmButtonText: '删除全部',
            }).then(({ isConfirmed }) => {
                app.isshowToast = false;
                if (!isConfirmed) {
                    return;
                }
                playsound('delete');
                this.unreadmsgList = [];
            });
        },
        removeread(key) {
            playsound('delete');
            this.unreadmsgList = this.unreadmsgList.filter(item => item.key !== key)
        },
        onMsgChange(index, item) {
            const key = Date.now(),
                date = formatTimestamp(key),
                vauleobj = {
                    index,
                    key,
                    date,
                    item
                };
            return this.unreadmsgList.push(vauleobj);
        },
        async history(evt) {
            let res = await fetch(this.historyurl),
                arrayBuffer = await res.arrayBuffer();
            res = decomp(new Uint8Array(arrayBuffer));
            console.log('recv history:');
            const result = JSON.parse(res);
            result.map(item => {
                const { type, value } = item;

                this.historyobj[type] = {
                    name: this.objmsgList[type].name,
                    data: Object.values(value).map(innerArray =>
                        innerArray.sort((a, b) => b.overtime.localeCompare(a.overtime))
                    ).reverse()
                };
            });
            this.historyType = Object.keys(this.historyobj)[0];
        },
        async selectedtypes(evt) {
            let name = evt.target.title;
            switch (name) {
                case 'top':
                    this.msgindex = '1';
                    return;
                case 'bottom':
                    this.msgindex = '2';
                    return;
                case 'full':
                    this.msgindex = '3';
                    return;
                case 'huangguan':
                    this.msgindex = '4';
                    return;
                case 'init':
                    this.msgindex = '5';
                    return;
                case 'history':
                    this.msgindex = '6';
                    return;
                case 'logout':
                    break;
                default:
                    break;
            }
            Swal.fire({
                title: '确定退出当前用户？',
                icon: 'warning',
                confirmButtonText: '确定退出'
            }).then(({ isConfirmed }) => {
                if (!isConfirmed) {
                    return;
                }
                this.logout();
            });

        },
        async init() {
            window.app = this;
            this.isVisible = false;
            this.$watch('msgindex', msgindex => {
                msgindex !== '6' ? this.historystat(this.objmsgList[msgindex].data) : this.historystat(this.historyobj[this.historyType].data[this.pageIndex - 1]);
            });
            this.$watch('pageIndex', pageIndex => {
                this.historystat(this.historyobj[this.historyType].data[pageIndex - 1]);
            });
            this.$watch('historyType', historyType => {
                this.historystat(this.historyobj[historyType].data[this.pageIndex - 1]);
            });
            this.login();
            setInterval(async () => {
                this.now_time = formatTimestamp(Date.now());
                this.card && this.expiry_time < this.now_time && this.client && this.logout();
            }, 1000);
            

        }

    }));
});