// 角色头像映射: key = "小说名|人物名" -> www/data/avatars 下的相对路径（方形头肩图）
// 图源:
//   红楼梦/水浒传: AI 生成肖像(2026-10-25), 依据原著外貌描写, 与清安录大卡肖像同一绘风
//     (半写实国风、深色水墨底、暖金轮廓光), 只做头像使用; 大卡整幅图仍走 charimg.js 的古典绣像。
//   清安录: 从既有 AI 肖像(data/charimg/qinganlu)裁切头肩方形图(裁切区避开右下角水印)。
// data.js 重新生成不会覆盖本文件。
window.CHARAVATAR = {
"红楼梦|贾宝玉":"data/avatars/honglou/jiabaoyu.jpg",
"红楼梦|林黛玉":"data/avatars/honglou/lindaiyu.jpg",
"红楼梦|薛宝钗":"data/avatars/honglou/xuebaochai.jpg",
"红楼梦|王熙凤":"data/avatars/honglou/wangxifeng.jpg",
"红楼梦|贾母":"data/avatars/honglou/jiamu.jpg",
"红楼梦|王夫人":"data/avatars/honglou/wangfuren.jpg",
"红楼梦|袭人":"data/avatars/honglou/xiren.jpg",
"红楼梦|晴雯":"data/avatars/honglou/qingwen.jpg",
"红楼梦|秦钟":"data/avatars/honglou/qinzhong.jpg",
"红楼梦|刘姥姥":"data/avatars/honglou/liulaolao.jpg",
"水浒传|宋江":"data/avatars/shuihu/songjiang.jpg",
"水浒传|林冲":"data/avatars/shuihu/linchong.jpg",
"水浒传|鲁智深":"data/avatars/shuihu/luzhishen.jpg",
"水浒传|武松":"data/avatars/shuihu/wusong.jpg",
"水浒传|李逵":"data/avatars/shuihu/likui.jpg",
"水浒传|卢俊义":"data/avatars/shuihu/lujunyi.jpg",
"水浒传|吴用":"data/avatars/shuihu/wuyong.jpg",
"水浒传|公孙胜":"data/avatars/shuihu/gongsunsheng.jpg",
"水浒传|晁盖":"data/avatars/shuihu/chaogai.jpg",
"水浒传|杨志":"data/avatars/shuihu/yangzhi.jpg",
"清安录|楚灵均":"data/avatars/qinganlu/chulingjun.jpg",
"清安录|凌安":"data/avatars/qinganlu/lingan.jpg",
"清安录|凌清寒":"data/avatars/qinganlu/lingqinghan.jpg",
"清安录|墨屠":"data/avatars/qinganlu/motu.jpg",
"清安录|苏清婉":"data/avatars/qinganlu/suqingwan.jpg",
"清安录|苏清鸢":"data/avatars/qinganlu/suqingyuan.jpg"
};
